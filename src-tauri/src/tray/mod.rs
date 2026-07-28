mod tray;
mod menu;
pub mod event;

use crate::startup_log;

pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    tray::create_tray(app).map_err(|e| {
        startup_log::write(&format!("tray create failed: {e}"));
        e
    })
}