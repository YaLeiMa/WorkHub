use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRunResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
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

/// 在项目目录下执行 shell 命令（Windows 经 cmd /C）。在 blocking 线程池运行，避免卡住 IPC。
#[tauri::command]
pub async fn run_shell_command(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ShellRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_shell_command_sync(command, cwd, timeout_ms))
        .await
        .map_err(|e| format!("命令执行线程异常：{e}"))?
}

fn is_long_running_dev_command(command: &str) -> bool {
    let lower = command.to_lowercase();
    [
        "npm run dev",
        "npm start",
        "yarn dev",
        "pnpm dev",
        "pnpm start",
        "vite",
        "next dev",
        "nuxt dev",
        "ng serve",
    ]
    .iter()
    .any(|p| lower.contains(p))
}

fn run_shell_command_sync(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ShellRunResult, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("命令不能为空".to_string());
    }
    if is_blocked_command(command) {
        return Err("该命令已被安全策略拦截".to_string());
    }
    if is_long_running_dev_command(command) {
        return Err(
            "npm run dev 等开发服务器命令不应在此执行（会长时间阻塞）。请改用「复制文本」步骤，再手动到终端粘贴运行。"
                .to_string(),
        );
    }

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000));
    let cwd = cwd.filter(|s| !s.trim().is_empty());

    if let Some(ref dir) = cwd {
        if !Path::new(dir).is_dir() {
            return Err("工作目录不存在".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", command]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-lc", command]);
        c
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd.as_deref() {
        cmd.current_dir(dir);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动命令：{e}"))?;
    let started = Instant::now();

    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("等待命令失败：{e}"))?
        {
            let mut stdout = String::new();
            let mut stderr = String::new();
            if let Some(mut out) = child.stdout.take() {
                use std::io::Read;
                let _ = out.read_to_string(&mut stdout);
            }
            if let Some(mut err) = child.stderr.take() {
                use std::io::Read;
                let _ = err.read_to_string(&mut stderr);
            }
            let code = status.code().unwrap_or(-1);
            return Ok(ShellRunResult {
                exit_code: code,
                stdout: trim_output(stdout, 4000),
                stderr: trim_output(stderr, 4000),
                success: status.success(),
            });
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            return Err(format!("命令执行超时（{} ms）", timeout.as_millis()));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
