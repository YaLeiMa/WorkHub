pub mod event;
pub mod register;

pub fn init(app: &tauri::AppHandle) {
    let _ = register::init(app);
}
