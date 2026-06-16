use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const MAIN_LABEL: &str = "main";

const SPOTLIGHT_LABEL: &str = "spotlight";

static DEFAULT_WINDOW_MODE: Mutex<String> = Mutex::new(String::new());

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_LABEL)
}

fn spotlight_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(SPOTLIGHT_LABEL)
}

pub fn set_default_window_mode(mode: &str) {
    if let Ok(mut guard) = DEFAULT_WINDOW_MODE.lock() {
        *guard = mode.to_string();
    }
}

fn default_window_mode() -> String {
    DEFAULT_WINDOW_MODE
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "spotlight".to_string())
}

fn hide_other(app: &AppHandle, keep: &str) {
    if keep != MAIN_LABEL {
        if let Some(w) = main_window(app) {
            let _ = w.hide();
        }
    }

    if keep != SPOTLIGHT_LABEL {
        if let Some(w) = spotlight_window(app) {
            let _ = w.hide();
        }
    }
}

fn show_window(window: &WebviewWindow, focus_search: bool) {
    let _ = window.show();

    let _ = window.unminimize();

    let _ = window.set_focus();

    if focus_search {
        let _ = window.emit("workhub:focus-search", ());
    }
}

pub fn show_main_window(app: &AppHandle, focus_search: bool, navigate_to: Option<&str>) {
    hide_other(app, MAIN_LABEL);

    if let Some(window) = main_window(app) {
        show_window(&window, focus_search);

        if let Some(path) = navigate_to {
            let _ = window.emit("workhub:navigate", path);
        }
    }
}

pub fn show_spotlight_window(app: &AppHandle) {
    hide_other(app, SPOTLIGHT_LABEL);

    if let Some(window) = spotlight_window(app) {
        let _ = window.center();

        show_window(&window, true);
    }
}

pub fn show_default_window(app: &AppHandle) {
    let mode = default_window_mode();

    match mode.as_str() {
        "main" => show_main_window(app, true, None),

        "spotlight" | "hidden" | "" => show_spotlight_window(app),

        _ => show_spotlight_window(app),
    }
}

pub fn toggle_tray_window(app: &AppHandle) {
    let sp_vis = spotlight_window(app)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    let sp_focus = spotlight_window(app)
        .map(|w| w.is_focused().unwrap_or(false))
        .unwrap_or(false);

    let mn_vis = main_window(app)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    let mn_focus = main_window(app)
        .map(|w| w.is_focused().unwrap_or(false))
        .unwrap_or(false);

    if sp_vis && sp_focus {
        hide_spotlight_window(app);

        return;
    }

    if mn_vis && mn_focus {
        hide_main_window(app);

        return;
    }

    if sp_vis {
        show_spotlight_window(app);

        return;
    }

    if mn_vis {
        show_main_window(app, true, None);

        return;
    }

    show_default_window(app);
}

pub fn toggle_spotlight_window(app: &AppHandle) {
    let Some(window) = spotlight_window(app) else {
        return;
    };

    let visible = window.is_visible().unwrap_or(false);

    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = window.hide();

        return;
    }

    show_spotlight_window(app);
}

pub fn toggle_main_window(app: &AppHandle, focus_search: bool) {
    let Some(window) = main_window(app) else {
        return;
    };

    let visible = window.is_visible().unwrap_or(false);

    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = window.hide();

        return;
    }

    show_main_window(app, focus_search, None);
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.hide();
    }
}

pub fn hide_spotlight_window(app: &AppHandle) {
    if let Some(window) = spotlight_window(app) {
        let _ = window.hide();
    }
}

pub fn apply_startup_window(app: &AppHandle, mode: &str) {
    set_default_window_mode(mode);

    hide_other(app, "");

    match mode {
        "main" => show_main_window(app, true, None),

        "spotlight" => show_spotlight_window(app),

        _ => {}
    }
}
