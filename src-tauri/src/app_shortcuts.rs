use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutItem {
    pub title: String,
    pub path: String,
    /// 额外搜索词（如中英文系统项）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<String>,
}

fn desktop_dirs(profile: &Path) -> Vec<PathBuf> {
    [
        profile.join("Desktop"),
        profile.join("桌面"),
        profile.join("OneDrive").join("Desktop"),
        profile.join("OneDrive").join("桌面"),
    ]
    .into_iter()
    .filter(|p| p.is_dir())
    .collect()
}

fn scan_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(profile) = std::env::var("USERPROFILE") {
        roots.extend(desktop_dirs(Path::new(&profile)));
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        let start = PathBuf::from(&appdata).join(r"Microsoft\Windows\Start Menu");
        roots.push(start.join("Programs"));
        roots.push(start);
    }

    if let Ok(program_data) = std::env::var("ProgramData") {
        roots.push(
            PathBuf::from(&program_data).join(r"Microsoft\Windows\Start Menu\Programs"),
        );
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(&local).join("Programs"));
    }

    roots.into_iter().filter(|p| p.is_dir()).collect()
}

fn push_item(
    items: &mut Vec<AppShortcutItem>,
    seen: &mut HashSet<String>,
    title: String,
    path: PathBuf,
    keywords: Vec<String>,
) {
    if title.trim().is_empty() || !path.is_file() {
        return;
    }
    let key = path.to_string_lossy().to_lowercase();
    if !seen.insert(key) {
        return;
    }
    items.push(AppShortcutItem {
        title,
        path: path.to_string_lossy().into_owned(),
        keywords,
    });
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn scan_tree(
    dir: &Path,
    items: &mut Vec<AppShortcutItem>,
    seen: &mut HashSet<String>,
    allow_exe: bool,
    max_depth: u32,
    depth: u32,
) {
    if depth > max_depth {
        return;
    }
    let Ok(read_dir) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_tree(&path, items, seen, allow_exe, max_depth, depth + 1);
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let ok = match ext.as_str() {
            "lnk" | "url" => true,
            "exe" => allow_exe,
            _ => false,
        };
        if !ok {
            continue;
        }
        push_item(items, seen, title_from_path(&path), path, Vec::new());
    }
}

fn append_builtins(items: &mut Vec<AppShortcutItem>, seen: &mut HashSet<String>) {
    let control = Path::new(r"C:\Windows\System32\control.exe");
    push_item(
        items,
        seen,
        "Control Panel".into(),
        control.to_path_buf(),
        vec![
            "控制面板".into(),
            "control panel".into(),
            "control".into(),
        ],
    );
}

#[cfg(windows)]
pub fn list_app_shortcuts() -> Vec<AppShortcutItem> {
    let mut items = Vec::new();
    let mut seen = HashSet::new();

    for root in scan_roots() {
        scan_tree(&root, &mut items, &mut seen, true, 8, 0);
    }

    append_builtins(&mut items, &mut seen);

    items.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    items
}

#[cfg(not(windows))]
pub fn list_app_shortcuts() -> Vec<AppShortcutItem> {
    Vec::new()
}
