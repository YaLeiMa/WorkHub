use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::shortcut::event;

static HOTKEYS: Mutex<Option<(Shortcut, Shortcut)>> = Mutex::new(None);
static QUIT_REGISTERED: Mutex<bool> = Mutex::new(false);

fn register_pair(
    app: &AppHandle,
    spotlight: &Shortcut,
    main: &Shortcut,
) -> Result<(), String> {
    let spotlight_handle = app.clone();
    let main_handle = app.clone();
    let spotlight_key = spotlight.clone();
    let main_key = main.clone();

    app.global_shortcut()
        .on_shortcut(spotlight_key, move |_app, shortcut, event| {
            if shortcut == &spotlight_key && event.state() == ShortcutState::Pressed {
                event::handle_spotlight_shortcut(&spotlight_handle);
            }
        })
        .map_err(|e| e.to_string())?;

    app.global_shortcut()
        .on_shortcut(main_key, move |_app, shortcut, event| {
            if shortcut == &main_key && event.state() == ShortcutState::Pressed {
                event::handle_main_shortcut(&main_handle);
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    reload(app, "Alt+X".to_string(), "Alt+Z".to_string())
}

pub fn reload(app: &AppHandle, spotlight: String, main: String) -> tauri::Result<()> {
    let spotlight_sc: Shortcut = spotlight
        .parse()
        .map_err(|e| tauri::Error::from(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("悬浮窗快捷键无效: {e}"),
        )))?;
    let main_sc: Shortcut = main.parse().map_err(|e| {
        tauri::Error::from(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("主窗口快捷键无效: {e}"),
        ))
    })?;

    if let Ok(mut guard) = HOTKEYS.lock() {
        if let Some((old_spotlight, old_main)) = guard.take() {
            let _ = app.global_shortcut().unregister(old_spotlight);
            let _ = app.global_shortcut().unregister(old_main);
        }
        register_pair(app, &spotlight_sc, &main_sc).map_err(|e| {
            tauri::Error::from(std::io::Error::new(std::io::ErrorKind::Other, e))
        })?;
        *guard = Some((spotlight_sc, main_sc));
    }

    let quit_handle = app.clone();
    let quit_shortcut: Shortcut = "Ctrl+Alt+Q".parse().unwrap();
    let mut quit_guard = QUIT_REGISTERED.lock().map_err(|e| {
        tauri::Error::from(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;
    if !*quit_guard {
        app.global_shortcut()
            .on_shortcut(quit_shortcut, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    event::handle_quit_shortcut(&quit_handle);
                }
            })
            .map_err(|e| {
                tauri::Error::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;
        *quit_guard = true;
    }

    Ok(())
}
