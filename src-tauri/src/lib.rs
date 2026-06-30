// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod app_shortcuts;
mod commands;
mod shortcut;
mod tray;
mod window;

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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .setup(|app| {
            tray::init(app.handle());
            shortcut::init(app.handle());
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
