use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::startup_log;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 600_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRunResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    /// true 表示这是一次「后台常驻」启动，命令仍在运行
    pub background: bool,
    pub run_id: Option<String>,
    pub pid: Option<u32>,
    pub log_path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShellRunInfo {
    pub id: String,
    /// 展示用名称：优先用调用方给的（步骤标题 / 工作流名），没给就从命令推导
    pub name: String,
    pub command: String,
    pub cwd: Option<String>,
    pub pid: u32,
    pub background: bool,
    pub started_at: u64,
    pub log_path: Option<String>,
}

/// 没给名称时的兜底：取第一条子命令的程序名（去掉路径与 .exe/.cmd/.bat 后缀）
fn fallback_run_name(command: &str) -> String {
    let first = command
        .split(['&', ';', '|', '\n', '\r'])
        .next()
        .unwrap_or(command)
        .trim();
    let program = first
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == '\'');
    let base = program.rsplit(['/', '\\']).next().unwrap_or(program);
    let base = base
        .strip_suffix(".exe")
        .or_else(|| base.strip_suffix(".cmd"))
        .or_else(|| base.strip_suffix(".bat"))
        .unwrap_or(base);
    if base.is_empty() {
        "后台命令".to_string()
    } else {
        base.to_string()
    }
}

fn resolve_run_name(name: Option<String>, command: &str) -> String {
    let trimmed = name.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
        return fallback_run_name(command);
    }
    if trimmed.chars().count() > 60 {
        format!("{}…", trimmed.chars().take(60).collect::<String>())
    } else {
        trimmed
    }
}

fn trim_output(s: String, max: usize) -> String {
    if s.len() <= max {
        return s;
    }
    format!("{}…", &s[..max])
}

fn is_blocked_command(command: &str) -> bool {
    let lower = command.to_lowercase();
    [
        "format ",
        "del /f",
        "rd /s",
        "rmdir /s",
        "remove-item -recurse -force",
        "rm -rf /",
        "shutdown ",
        "restart-computer",
    ]
    .iter()
    .any(|p| lower.contains(p))
}

/// 识别「常驻服务类」命令（dev server / watch）。
///
/// 只按每段子命令的首个 token（程序名）判断，避免旧版子串匹配的误伤：
/// `git commit -m "fix vite config"`、路径里带 `vite` 不再被误拦，
/// 而 `npm run start`、`yarn start` 这类旧版漏网的写法能被识别出来。
fn detect_dev_server(command: &str) -> Option<String> {
    let lower = command.to_lowercase();
    for segment in lower.split(['&', ';', '|', '\n', '\r']) {
        let tokens: Vec<&str> = segment.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        // 跳过 `FOO=bar cmd` 形式的环境变量前缀
        let mut idx = 0;
        while idx < tokens.len() && tokens[idx].contains('=') && !tokens[idx].starts_with("--") {
            idx += 1;
        }
        if idx >= tokens.len() {
            continue;
        }

        let raw_program = tokens[idx].trim_matches(|c| c == '"' || c == '\'');
        let program = raw_program.rsplit(['/', '\\']).next().unwrap_or(raw_program);
        let program = program
            .strip_suffix(".cmd")
            .or_else(|| program.strip_suffix(".bat"))
            .or_else(|| program.strip_suffix(".exe"))
            .unwrap_or(program);

        // 包装器：剖开后再看真正执行的程序（cmd /c npm start、call xxx）
        if matches!(
            program,
            "cmd" | "call" | "start" | "powershell" | "pwsh" | "sh" | "bash"
        ) {
            let mut rest: &[&str] = &tokens[idx + 1..];
            while let Some(first) = rest.first() {
                if first.starts_with('/') || first.starts_with('-') || *first == "start" {
                    rest = &rest[1..];
                } else {
                    break;
                }
            }
            if !rest.is_empty() {
                if let Some(hit) = detect_dev_server(&rest.join(" ")) {
                    return Some(hit);
                }
            }
            continue;
        }

        let rest = &tokens[idx + 1..];
        let has = |name: &str| rest.iter().any(|t| *t == name);
        let script_name = |s: &str| s.split(':').next().unwrap_or(s).to_string();
        let is_long_script = |s: &str| matches!(s, "dev" | "serve" | "watch" | "start");

        let hit = match program {
            "npm" | "pnpm" | "yarn" | "bun" => {
                if has("start") || has("serve") {
                    Some(format!("{program} start/serve"))
                } else if let Some(pos) = rest.iter().position(|t| *t == "run") {
                    rest.get(pos + 1)
                        .map(|s| script_name(s))
                        .filter(|s| is_long_script(s))
                        .map(|s| format!("{program} run {s}"))
                } else {
                    rest.first()
                        .map(|s| script_name(s))
                        .filter(|s| is_long_script(s))
                        .map(|s| format!("{program} {s}"))
                }
            }
            "vite" => {
                if has("build") || has("preview") {
                    None
                } else {
                    Some("vite（开发服务器）".to_string())
                }
            }
            "next" | "nuxt" => {
                if has("dev") || has("start") {
                    Some(format!("{program} dev/start"))
                } else {
                    None
                }
            }
            "ng" => {
                if has("serve") {
                    Some("ng serve".to_string())
                } else {
                    None
                }
            }
            "nodemon" | "ts-node-dev" | "webpack-dev-server" | "serve" => {
                Some(format!("{program}（常驻监听）"))
            }
            "tsx" | "ts-node" => {
                if has("watch") {
                    Some(format!("{program} watch"))
                } else {
                    None
                }
            }
            _ => None,
        };
        if hit.is_some() {
            return hit;
        }
    }
    None
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn next_run_id() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(1);
    format!("sh_{}_{}", now_ms(), SEQ.fetch_add(1, Ordering::Relaxed))
}

fn prepare_log_path(run_id: &str) -> Option<PathBuf> {
    let dir = startup_log::log_dir()?.join("shell-logs");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{run_id}.log")))
}

#[cfg(target_os = "windows")]
fn shell_command_for(command: &str) -> Command {
    let mut c = Command::new("cmd");
    c.args(["/C", command]);
    c
}

#[cfg(not(target_os = "windows"))]
fn shell_command_for(command: &str) -> Command {
    let mut c = Command::new("sh");
    c.args(["-lc", command]);
    c
}

/// 进程树托管：Windows 用 Job Object。
///
/// - 后台常驻任务：带 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，WorkHub 退出时整棵树自动回收，
///   不会再出现「关了应用进程还留着」。
/// - 前台任务：不带该标志（正常结束后不能让 `start xxx` 拉起的旁观进程被连坐），
///   但超时 / 主动停止时调用 `TerminateJobObject` 整树杀掉 —— 修掉旧版
///   `child.kill()` 只杀 cmd.exe、把 pnpm/node 留下的问题。
#[cfg(windows)]
mod job {
    use std::ffi::c_void;
    use std::process::Child;

    #[repr(C)]
    struct BasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct ExtendedLimitInformation {
        basic: BasicLimitInformation,
        io: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
    const EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *mut c_void, name: *const u16) -> *mut c_void;
        fn SetInformationJobObject(job: *mut c_void, class: i32, info: *mut c_void, len: u32) -> i32;
        fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        fn TerminateJobObject(job: *mut c_void, exit_code: u32) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    pub struct Job(isize);

    // HANDLE 只是一个指针值，进程内跨线程移动是安全的
    unsafe impl Send for Job {}

    impl Job {
        pub fn create(kill_on_close: bool) -> Option<Job> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                if kill_on_close {
                    let mut info: ExtendedLimitInformation = std::mem::zeroed();
                    info.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                    let ok = SetInformationJobObject(
                        handle,
                        EXTENDED_LIMIT_INFORMATION_CLASS,
                        &mut info as *mut _ as *mut c_void,
                        std::mem::size_of::<ExtendedLimitInformation>() as u32,
                    );
                    if ok == 0 {
                        CloseHandle(handle);
                        return None;
                    }
                }
                Some(Job(handle as isize))
            }
        }

        pub fn assign(&self, child: &Child) -> bool {
            use std::os::windows::io::AsRawHandle;
            unsafe {
                AssignProcessToJobObject(self.0 as *mut c_void, child.as_raw_handle() as *mut c_void)
                    != 0
            }
        }

        pub fn terminate(&self) {
            unsafe {
                TerminateJobObject(self.0 as *mut c_void, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0 as *mut c_void);
            }
        }
    }
}

#[cfg(not(windows))]
mod job {
    use std::process::Child;

    pub struct Job;

    impl Job {
        pub fn create(_kill_on_close: bool) -> Option<Job> {
            None
        }
        pub fn assign(&self, _child: &Child) -> bool {
            false
        }
        pub fn terminate(&self) {}
    }
}

struct RunningShell {
    info: ShellRunInfo,
    child: Child,
    job: Option<job::Job>,
}

fn registry() -> &'static Mutex<HashMap<String, RunningShell>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, RunningShell>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Job Object 分配失败时的兜底：按 PID 杀整棵树（taskkill 也用隐藏窗口，避免闪黑框）
#[cfg(windows)]
fn kill_tree_fallback(pid: u32) {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();
}

#[cfg(not(windows))]
fn kill_tree_fallback(_pid: u32) {}

fn kill_entry(entry: &mut RunningShell) -> bool {
    match entry.job.take() {
        // Job Object 在手上：直接终止整个 job（cmd 及全部子孙）
        Some(job) => job.terminate(),
        // 没有 job：趁父子关系还在，先按树杀，再补一刀直接子进程
        None => kill_tree_fallback(entry.info.pid),
    }
    let _ = entry.child.kill();
    true
}

/// 在项目目录下执行 shell 命令（Windows 经 cmd /C）。在 blocking 线程池运行，避免卡住 IPC。
///
/// `name`：展示用名称（工作流传步骤标题 / 工作流名），空则从命令推导。
/// `background = true`：隐藏窗口启动、立刻返回 PID（服务类命令用），日志写入应用数据目录；
/// 进程树由 Job Object 托管，可用 `shell_run_stop` 停止，WorkHub 退出时自动回收。
#[tauri::command]
pub async fn run_shell_command(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    background: Option<bool>,
    name: Option<String>,
) -> Result<ShellRunResult, String> {
    let background = background.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        run_shell_command_sync(command, cwd, timeout_ms, background, name)
    })
    .await
    .map_err(|e| format!("命令执行线程异常：{e}"))?
}

fn run_shell_command_sync(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    background: bool,
    name: Option<String>,
) -> Result<ShellRunResult, String> {
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("命令不能为空".to_string());
    }
    if is_blocked_command(&command) {
        return Err("该命令已被安全策略拦截".to_string());
    }
    if !background {
        if let Some(matched) = detect_dev_server(&command) {
            return Err(format!(
                "「{matched}」属于常驻服务类命令，前台执行只会等到超时被中断。请勾选步骤里的「后台常驻运行」再执行，或改用「复制文本」步骤手动到终端运行。"
            ));
        }
    }

    let cwd = cwd.filter(|s| !s.trim().is_empty());
    if let Some(ref dir) = cwd {
        if !Path::new(dir).is_dir() {
            return Err("工作目录不存在".to_string());
        }
    }

    let run_id = next_run_id();
    let log_path = if background {
        prepare_log_path(&run_id)
    } else {
        None
    };

    let mut cmd = shell_command_for(&command);
    cmd.stdin(Stdio::null());

    if background {
        match log_path
            .as_ref()
            .and_then(|p| std::fs::File::create(p).ok())
            .and_then(|file| file.try_clone().ok().map(|clone| (file, clone)))
        {
            Some((out, err)) => {
                cmd.stdout(Stdio::from(out));
                cmd.stderr(Stdio::from(err));
            }
            None => {
                cmd.stdout(Stdio::null());
                cmd.stderr(Stdio::null());
            }
        }
    } else {
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    }

    if let Some(dir) = cwd.as_deref() {
        cmd.current_dir(dir);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动命令：{e}"))?;
    let pid = child.id();
    let job = job::Job::create(background).filter(|j| j.assign(&child));

    let log_path_string = log_path.as_ref().map(|p| p.to_string_lossy().into_owned());
    let name = resolve_run_name(name, &command);

    let info = ShellRunInfo {
        id: run_id.clone(),
        name,
        command: command.clone(),
        cwd: cwd.clone(),
        pid,
        background,
        started_at: now_ms(),
        log_path: log_path_string.clone(),
    };

    if background {
        let registered = registry()
            .lock()
            .map(|mut guard| {
                guard.insert(
                    run_id.clone(),
                    RunningShell {
                        info: info.clone(),
                        child,
                        job,
                    },
                );
            })
            .is_ok();
        if !registered {
            return Err("无法登记后台任务".to_string());
        }
        return Ok(ShellRunResult {
            exit_code: 0,
            stdout: String::new(),
            stderr: String::new(),
            success: true,
            background: true,
            run_id: Some(run_id),
            pid: Some(pid),
            log_path: log_path_string,
        });
    }

    // 前台：先把管道交给读取线程，避免命令输出撑满管道时双方互等
    let stdout_thread = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = String::new();
            let _ = out.read_to_string(&mut buf);
            buf
        })
    });
    let stderr_thread = child.stderr.take().map(|mut err| {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = String::new();
            let _ = err.read_to_string(&mut buf);
            buf
        })
    });

    if registry()
        .lock()
        .map(|mut guard| {
            guard.insert(
                run_id.clone(),
                RunningShell {
                    info,
                    child,
                    job,
                },
            );
        })
        .is_err()
    {
        return Err("无法登记命令任务".to_string());
    }

    let timeout = Duration::from_millis(
        timeout_ms
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .clamp(1_000, MAX_TIMEOUT_MS),
    );
    let started = Instant::now();

    loop {
        let finished = {
            let mut guard = registry()
                .lock()
                .map_err(|_| "命令运行表不可用".to_string())?;
            match guard.get_mut(&run_id) {
                Some(entry) => match entry.child.try_wait() {
                    Ok(Some(status)) => guard.remove(&run_id).map(|entry| (status, entry)),
                    Ok(None) => None,
                    Err(e) => {
                        guard.remove(&run_id);
                        return Err(format!("等待命令失败：{e}"));
                    }
                },
                None => return Err("命令已被停止".to_string()),
            }
        };

        if let Some((status, entry)) = finished {
            let _entry = entry;
            let stdout = stdout_thread
                .map(|h| h.join().unwrap_or_default())
                .unwrap_or_default();
            let stderr = stderr_thread
                .map(|h| h.join().unwrap_or_default())
                .unwrap_or_default();
            return Ok(ShellRunResult {
                exit_code: status.code().unwrap_or(-1),
                stdout: trim_output(stdout, 4000),
                stderr: trim_output(stderr, 4000),
                success: status.success(),
                background: false,
                run_id: Some(run_id),
                pid: Some(pid),
                log_path: None,
            });
        }

        if started.elapsed() > timeout {
            stop_run(&run_id);
            return Err(format!(
                "命令执行超时（{} ms），已结束该命令的整棵进程树。若这是需要长期运行的服务（如 pnpm dsh web），请勾选步骤里的「后台常驻运行」。",
                timeout.as_millis()
            ));
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}

fn stop_run(id: &str) -> bool {
    let entry = registry().lock().ok().and_then(|mut guard| guard.remove(id));
    match entry {
        Some(mut entry) => kill_entry(&mut entry),
        None => false,
    }
}

fn stop_all_runs() -> usize {
    let entries: Vec<RunningShell> = registry()
        .lock()
        .map(|mut guard| guard.drain().map(|(_, entry)| entry).collect())
        .unwrap_or_default();
    let count = entries.len();
    for mut entry in entries {
        kill_entry(&mut entry);
    }
    count
}

/// 正在运行 / 后台常驻的命令列表。
///
/// 只清理「已自行退出」的后台任务；前台命令的收尾由它自己的等待线程负责，
/// 这里动它会和等待线程抢条目（会被误报成「命令已被停止」）。
#[tauri::command]
pub fn shell_run_list() -> Vec<ShellRunInfo> {
    let mut guard = match registry().lock() {
        Ok(guard) => guard,
        Err(_) => return Vec::new(),
    };
    let mut finished: Vec<String> = Vec::new();
    for (id, entry) in guard.iter_mut() {
        if entry.info.background && matches!(entry.child.try_wait(), Ok(Some(_))) {
            finished.push(id.clone());
        }
    }
    for id in finished {
        guard.remove(&id);
    }
    let mut list: Vec<ShellRunInfo> = guard.values().map(|entry| entry.info.clone()).collect();
    list.sort_by_key(|info| std::cmp::Reverse(info.started_at));
    list
}

/// 停止一个命令：整棵进程树一起结束。
#[tauri::command]
pub fn shell_run_stop(id: String) -> bool {
    stop_run(&id)
}

/// 停止所有命令（退出时也会调用）。
#[tauri::command]
pub fn shell_run_stop_all() -> usize {
    stop_all_runs()
}

/// 供应用退出时调用：回收全部子进程树。
pub fn stop_all_on_exit() {
    let count = stop_all_runs();
    if count > 0 {
        startup_log::write(&format!("shell: stopped {count} running command(s) on exit"));
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_dev_server, is_blocked_command};

    #[test]
    fn detects_long_running_commands() {
        for cmd in [
            "npm start",
            "npm run dev",
            "npm run start",
            "yarn start",
            "pnpm dev",
            "pnpm run serve",
            "vite",
            "vite --host",
            "next dev",
            "ng serve",
            "nodemon server.js",
            "cmd /c npm start",
        ] {
            assert!(detect_dev_server(cmd).is_some(), "应识别为常驻：{cmd}");
        }
    }

    #[test]
    fn keeps_short_commands_alone() {
        for cmd in [
            "git status",
            "git pull",
            "npm run build",
            "vite build",
            "pnpm dsh web",
            "node proxy.mjs",
            "git commit -m \"fix vite config\"",
            "cd D:\\projects\\vite-app && npm run build",
        ] {
            assert!(detect_dev_server(cmd).is_none(), "不应误拦：{cmd}");
        }
    }

    #[test]
    fn blocks_destructive_commands() {
        assert!(is_blocked_command("shutdown /s /t 0"));
        assert!(!is_blocked_command("git status"));
    }

    #[test]
    fn resolves_run_names() {
        use super::resolve_run_name;

        // 调用方给了名称：去空白后直接用
        assert_eq!(
            resolve_run_name(Some("  拉取代码 ".into()), "git pull"),
            "拉取代码"
        );
        // 没给：取第一条子命令的程序名
        assert_eq!(resolve_run_name(None, "pnpm dsh web"), "pnpm");
        assert_eq!(resolve_run_name(None, "git status && git pull"), "git");
        // 空字符串：等同没给
        assert_eq!(
            resolve_run_name(Some("   ".into()), r#""D:\tools\pnpm.cmd" dsh web"#),
            "pnpm"
        );
    }
}
