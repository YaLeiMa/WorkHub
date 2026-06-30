use std::path::Path;
use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::app_shortcuts;
use crate::window;

/// 设置主窗口是否置顶。
#[tauri::command]
pub fn window_set_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .set_always_on_top(always_on_top)
        .map_err(|e| e.to_string())
}

/// 用 VSCode 打开指定路径（执行 `code <path>`）。
/// Windows 下 `code` 实为 `code.cmd`，需经 `cmd /C` 调用。
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    let spawn = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "code", &path]).spawn()
    } else {
        Command::new("code").arg(&path).spawn()
    };

    spawn
        .map(|_| ())
        .map_err(|_| "未检测到 VSCode，请先安装或配置 code 命令".to_string())
}

/// 隐藏主窗口到托盘（Esc / 关闭按钮调用）。
#[tauri::command]
pub fn window_hide(app: AppHandle) -> Result<(), String> {
    window::hide_main_window(&app);
    Ok(())
}

#[tauri::command]
pub fn window_hide_spotlight(app: AppHandle) -> Result<(), String> {
    window::hide_spotlight_window(&app);
    Ok(())
}

#[tauri::command]
pub fn window_show_main(
    app: AppHandle,
    path: Option<String>,
    focus_search: bool,
) -> Result<(), String> {
    window::show_main_window(&app, focus_search, path.as_deref());
    Ok(())
}

#[tauri::command]
pub fn window_show_spotlight(app: AppHandle) -> Result<(), String> {
    window::show_spotlight_window(&app);
    Ok(())
}

#[tauri::command]
pub fn apply_startup_window(app: AppHandle, mode: String) -> Result<(), String> {
    window::apply_startup_window(&app, &mode);
    Ok(())
}

#[tauri::command]
pub fn sync_default_window_mode(mode: String) {
    window::set_default_window_mode(&mode);
}

#[tauri::command]
pub fn shortcut_reload(app: AppHandle, spotlight: String, main: String) -> Result<(), String> {
    crate::shortcut::register::reload(&app, spotlight, main).map_err(|e| e.to_string())
}

/// 返回用户实际在用的桌面目录（OneDrive / 本地 / 中文「桌面」）。
#[tauri::command]
pub fn resolve_desktop_dir() -> Option<String> {
    let profile = std::env::var("USERPROFILE").ok()?;
    let profile = Path::new(&profile);
    let candidates = [
        profile.join("Desktop"),
        profile.join("桌面"),
        profile.join("OneDrive").join("Desktop"),
        profile.join("OneDrive").join("桌面"),
    ];
    candidates
        .into_iter()
        .filter(|p| p.is_dir())
        .max_by_key(|p| std::fs::read_dir(p).map(|rd| rd.count()).unwrap_or(0))
        .map(|p| p.to_string_lossy().into_owned())
}

/// 扫描桌面、开始菜单等位置的快捷方式，供应用内选择器使用。
#[tauri::command]
pub fn list_app_shortcuts() -> Vec<app_shortcuts::AppShortcutItem> {
    app_shortcuts::list_app_shortcuts()
}

/// 启动快捷应用（.exe / .lnk / .url / .app 等）。
#[tauri::command]
pub fn launch_app(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    let p = Path::new(path);
    if !p.exists() {
        return Err("应用不存在或路径无效".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        // 快捷方式 / 互联网快捷方式（如 Steam 桌面项）用 Shell 打开
        if ext == "lnk" || ext == "url" {
            open::that(path).map_err(|_| "无法启动该应用".to_string())?;
        } else if matches!(ext.as_str(), "exe" | "bat" | "cmd" | "msi") {
            let mut cmd = Command::new(path);
            // 与快捷方式「起始位置」一致：exe 在其所在目录启动
            if let Some(dir) = p.parent().filter(|d| !d.as_os_str().is_empty()) {
                cmd.current_dir(dir);
            }
            cmd.spawn()
                .map_err(|_| "无法启动该应用".to_string())?;
        } else {
            open::that(path).map_err(|_| "无法启动该应用".to_string())?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(path).map_err(|_| "无法启动该应用".to_string())?;
    }

    Ok(())
}

/// 用系统默认程序打开本地文件或文件夹（绕过 opener 插件路径 scope 限制）。
#[tauri::command]
pub fn open_local_path(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    let p = Path::new(path);
    if !p.exists() {
        return Err("文件不存在或已被移动".to_string());
    }
    open::that(path).map_err(|_| "无法打开该文件".to_string())
}

/// 读取本地图片并返回 Data URL（供工具箱拖放图片等使用）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFilePayload {
    pub data_url: String,
    pub name: String,
    pub size: u64,
}

fn image_mime(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

#[tauri::command]
pub fn read_image_file(path: String) -> Result<ImageFilePayload, String> {
    use base64::Engine;

    let path = path.trim();
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    let p = Path::new(path);
    if !p.is_file() {
        return Err("不是有效的图片文件".to_string());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = image_mime(&ext).ok_or_else(|| "不支持的图片格式".to_string())?;
    let bytes = std::fs::read(p).map_err(|e| format!("读取文件失败：{e}"))?;
    let size = bytes.len() as u64;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();
    Ok(ImageFilePayload {
        data_url: format!("data:{mime};base64,{b64}"),
        name,
        size,
    })
}

/// 将文本写入用户选择的备份文件路径。
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    std::fs::write(path, contents).map_err(|e| format!("写入文件失败：{e}"))
}

/// 读取用户选择的备份文件内容。
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    std::fs::read_to_string(path).map_err(|e| format!("读取文件失败：{e}"))
}
