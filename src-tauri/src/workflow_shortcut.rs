use std::collections::HashSet;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowHotkeyBinding {
    pub workflow_id: String,
    pub hotkey: String,
}

static WORKFLOW_SHORTCUTS: Mutex<Vec<Shortcut>> = Mutex::new(Vec::new());

fn unregister_all(app: &AppHandle) {
    if let Ok(mut guard) = WORKFLOW_SHORTCUTS.lock() {
        for sc in guard.drain(..) {
            let _ = app.global_shortcut().unregister(sc);
        }
    }
}

/// 注册工作流全局快捷键；空 hotkey 的绑定会被忽略。
#[tauri::command]
pub fn workflow_shortcuts_reload(
    app: AppHandle,
    bindings: Vec<WorkflowHotkeyBinding>,
) -> Result<(), String> {
    unregister_all(&app);

    let mut used = HashSet::new();
    for b in bindings {
        let hotkey = b.hotkey.trim();
        if hotkey.is_empty() {
            continue;
        }
        if !used.insert(hotkey.to_lowercase()) {
            return Err(format!("快捷键冲突：{hotkey}"));
        }

        let sc: Shortcut = hotkey
            .parse()
            .map_err(|e| format!("快捷键无效（{hotkey}）：{e}"))?;

        let handle = app.clone();
        let wf_id = b.workflow_id;

        app.global_shortcut()
            .on_shortcut(sc.clone(), move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = handle.emit("workhub:run-workflow", wf_id.clone());
                }
            })
            .map_err(|e| format!("注册快捷键 {hotkey} 失败：{e}"))?;

        if let Ok(mut guard) = WORKFLOW_SHORTCUTS.lock() {
            guard.push(sc);
        }
    }

    Ok(())
}
