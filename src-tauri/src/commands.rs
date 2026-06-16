use std::path::Path;
use std::process::Command;

use tauri::{AppHandle, Manager};

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
