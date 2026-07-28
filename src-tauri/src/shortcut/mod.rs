pub mod event;
pub mod register;

pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    register::init(app)
}
