use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Runtime,
};

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        "退出程序",
        true,
        Some("Ctrl+Alt+Q"),
    )?;

    Menu::with_items(app, &[&show, &settings, &quit])
}
