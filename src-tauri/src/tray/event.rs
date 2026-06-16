use tauri::AppHandle;

use crate::window;

pub fn handle_menu_event(app: &AppHandle, event_id: &str) -> tauri::Result<()> {
    match event_id {
        "show" => window::show_default_window(app),
        "settings" => {
            window::show_main_window(app, false, Some("/settings"));
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
    Ok(())
}
