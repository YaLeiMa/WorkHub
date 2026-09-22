use tauri::AppHandle;

use crate::{shell_command, startup_log, window};

pub fn handle_menu_event(app: &AppHandle, event_id: &str) -> tauri::Result<()> {
    match event_id {
        "show" => window::show_default_window(app),
        "settings" => {
            window::show_main_window(app, false, Some("/settings"));
        }
        "background_commands" => {
            window::show_main_window(app, false, Some("/workflows"));
        }
        "stop_shells" => {
            let stopped = shell_command::shell_run_stop_all();
            startup_log::write(&format!("tray: stop all background commands -> {stopped}"));
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
    Ok(())
}
