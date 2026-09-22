// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub mod startup_log;

mod app_shortcuts;
mod commands;
mod db_maintenance;
mod git_status;
mod shell_command;
mod shortcut;
mod tray;
mod window;
mod workflow_shortcut;

use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_v1_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                path TEXT NOT NULL,
                git_url TEXT,
                tags TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                links TEXT,
                commands TEXT,
                docs TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                language TEXT,
                tags TEXT,
                code TEXT NOT NULL,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                target TEXT NOT NULL,
                tags TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_recents_table",
            sql: "
            CREATE TABLE IF NOT EXISTS recents (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT,
                ref_id TEXT NOT NULL,
                action TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_recents_created_at ON recents(created_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_app_meta_table",
            sql: "
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "snippets_add_description",
            sql: "ALTER TABLE snippets ADD COLUMN description TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "projects_add_group_name",
            sql: "ALTER TABLE projects ADD COLUMN group_name TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "projects_add_sort_order",
            sql: "ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_clipboard_history_table",
            sql: "
            CREATE TABLE IF NOT EXISTS clipboard_history (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                preview TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_clipboard_history_created_at ON clipboard_history(created_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "favorites_add_color",
            sql: "ALTER TABLE favorites ADD COLUMN color TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "rename_snippet_category_code",
            sql: "UPDATE snippets SET category = '代码' WHERE category = '代码片段';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "clipboard_history_add_pinned",
            sql: "
            ALTER TABLE clipboard_history ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE clipboard_history ADD COLUMN pinned_at INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_clipboard_history_pinned ON clipboard_history(pinned DESC, pinned_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "create_snippet_variable_values",
            sql: "
            CREATE TABLE IF NOT EXISTS snippet_variable_values (
                snippet_id TEXT NOT NULL,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (snippet_id, name)
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create_launcher_apps_table",
            sql: "
            CREATE TABLE IF NOT EXISTS launcher_apps (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                target TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                tags TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "create_workflows_and_ssh_profiles",
            sql: "
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                project_id TEXT,
                tags TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                steps TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ssh_profiles (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                user TEXT NOT NULL,
                identity_file TEXT,
                proxy_jump TEXT,
                project_id TEXT,
                notes TEXT,
                tags TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "create_workflow_runs_table",
            sql: "
            CREATE TABLE IF NOT EXISTS workflow_runs (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                workflow_title TEXT NOT NULL,
                status TEXT NOT NULL,
                dry_run INTEGER NOT NULL DEFAULT 0,
                started_at INTEGER NOT NULL,
                finished_at INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                steps_log TEXT NOT NULL,
                error_message TEXT,
                variables TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "workflows_add_hotkey",
            sql: "ALTER TABLE workflows ADD COLUMN hotkey TEXT;",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    startup_log::install_panic_hook();
    startup_log::write("main() entry");
    db_maintenance::prepare_database();
    startup_log::write("WorkHub run() begin");

    let app = match tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::toggle_spotlight_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:workhub.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::open_in_vscode,
            commands::open_local_path,
            commands::launch_app,
            commands::resolve_desktop_dir,
            commands::list_app_shortcuts,
            commands::window_hide,
            commands::window_hide_spotlight,
            commands::window_show_main,
            commands::window_show_spotlight,
            commands::apply_startup_window,
            commands::sync_default_window_mode,
            commands::shortcut_reload,
            commands::window_set_always_on_top,
            commands::write_text_file,
            commands::read_text_file,
            commands::read_image_file,
            git_status::git_repo_status,
            git_status::git_repo_branches,
            shell_command::run_shell_command,
            shell_command::shell_run_list,
            shell_command::shell_run_stop,
            shell_command::shell_run_stop_all,
            workflow_shortcut::workflow_shortcuts_reload,
            db_maintenance::db_checkpoint,
        ])
        .setup(|app| {
            startup_log::write("setup: begin");
            if let Err(e) = tray::init(app.handle()) {
                startup_log::write(&format!("setup: tray init failed: {e}"));
            } else {
                startup_log::write("setup: tray ok");
            }
            if let Err(e) = shortcut::init(app.handle()) {
                startup_log::write(&format!("setup: shortcut init failed: {e}"));
            } else {
                startup_log::write("setup: shortcut ok");
            }
            startup_log::write("setup: complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .on_menu_event(|app, event| {
            let _ = crate::tray::event::handle_menu_event(app, event.id().as_ref());
        })
        .build(tauri::generate_context!())
    {
        Ok(app) => app,
        Err(e) => {
            let msg = format!("WorkHub 启动失败：{e}");
            startup_log::write(&msg);
            show_fatal_dialog(&msg);
            return;
        }
    };

    app.run(|_app, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                shell_command::stop_all_on_exit();
                db_maintenance::checkpoint_on_exit();
            }
            _ => {}
        }
    });
    startup_log::write("run() exited normally");
}

#[cfg(windows)]
fn show_fatal_dialog(message: &str) {
    use std::os::windows::process::CommandExt;

    // 用 GUI 弹窗而不是控制台窗口：必须带 CREATE_NO_WINDOW，否则会闪一个黑框
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let log_hint = startup_log::log_file_path()
        .map(|p| format!("\n\n日志：{}", p.display()))
        .unwrap_or_default();
    let text = format!("{message}{log_hint}");
    let ps = format!(
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(@'\n{}\n'@,'WorkHub 启动失败','OK','Error')",
        text.replace('\'', "''")
    );
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

#[cfg(not(windows))]
fn show_fatal_dialog(message: &str) {
    eprintln!("{message}");
    if let Some(path) = startup_log::log_file_path() {
        eprintln!("Log: {}", path.display());
    }
}
