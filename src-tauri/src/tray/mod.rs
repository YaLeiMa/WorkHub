mod tray;
mod menu;
pub mod event;

pub fn init(app: &tauri::AppHandle) {
    let _ = tray::create_tray(app);
}