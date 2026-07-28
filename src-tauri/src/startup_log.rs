use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const APP_DIR: &str = "com.workhub.app";
const LOG_NAME: &str = "workhub.log";
const MAX_BYTES: u64 = 512 * 1024;

pub fn log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var("APPDATA")
            .ok()
            .map(|p| PathBuf::from(p).join(APP_DIR));
    }
    #[cfg(target_os = "macos")]
    {
        return std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join("Library/Application Support").join(APP_DIR));
    }
    #[cfg(target_os = "linux")]
    {
        return std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join(".local/share").join(APP_DIR));
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

pub fn log_file_path() -> Option<PathBuf> {
    log_dir().map(|d| d.join(LOG_NAME))
}

fn timestamp() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", d.as_secs(), d.subsec_millis())
}

fn trim_if_oversized(path: &PathBuf) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_BYTES {
            let backup = path.with_extension("log.old");
            let _ = std::fs::rename(path, backup);
        }
    }
}

/// 写入启动/崩溃日志：%APPDATA%/com.workhub.app/workhub.log
pub fn write(message: &str) {
    let Some(dir) = log_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(LOG_NAME);
    trim_if_oversized(&path);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{}] {}", timestamp(), message);
    }
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        write(&format!("PANIC: {info}"));
    }));
}
