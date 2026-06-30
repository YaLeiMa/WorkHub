use tauri::AppHandle;

use crate::window;

pub fn handle_spotlight_shortcut(app: &AppHandle) {
    window::toggle_spotlight_window(app);
}

pub fn handle_main_shortcut(app: &AppHandle) {
    window::toggle_main_window(app, false);
}

pub fn handle_quit_shortcut(app: &AppHandle) {
    app.exit(0);
}
