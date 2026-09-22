use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Runtime,
};

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let background = MenuItem::with_id(
        app,
        "background_commands",
        "后台命令…",
        true,
        None::<&str>,
    )?;
    let stop_shells = MenuItem::with_id(
        app,
        "stop_shells",
        "停止所有后台命令",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        "退出程序",
        true,
        Some("Ctrl+Alt+Q"),
    )?;

    Menu::with_items(app, &[&show, &settings, &background, &stop_shells, &quit])
}
