use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoStatus {
    pub has_repo: bool,
    pub branch: Option<String>,
    pub is_dirty: bool,
}

fn run_git(args: &[&str], cwd: &Path) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 读取项目目录的 Git 分支与 dirty 状态（只读，不执行 git 写操作）。
#[tauri::command]
pub async fn git_repo_status(path: String) -> GitRepoStatus {
    tauri::async_runtime::spawn_blocking(move || git_repo_status_sync(path))
        .await
        .unwrap_or(GitRepoStatus {
            has_repo: false,
            branch: None,
            is_dirty: false,
        })
}

fn git_repo_status_sync(path: String) -> GitRepoStatus {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return GitRepoStatus {
            has_repo: false,
            branch: None,
            is_dirty: false,
        };
    }
    let p = Path::new(trimmed);
    if !p.is_dir() {
        return GitRepoStatus {
            has_repo: false,
            branch: None,
            is_dirty: false,
        };
    }

    let inside = run_git(&["rev-parse", "--is-inside-work-tree"], p);
    let has_repo = inside.as_deref() == Some("true");
    if !has_repo {
        return GitRepoStatus {
            has_repo: false,
            branch: None,
            is_dirty: false,
        };
    }

    let branch = run_git(&["branch", "--show-current"], p).filter(|s| !s.is_empty());
    let porcelain = run_git(&["status", "--porcelain"], p).unwrap_or_default();
    GitRepoStatus {
        has_repo: true,
        branch,
        is_dirty: !porcelain.is_empty(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchList {
    pub has_repo: bool,
    pub current: Option<String>,
    pub branches: Vec<String>,
}

/// 列出本地分支（只读，最多 80 条）。
#[tauri::command]
pub async fn git_repo_branches(path: String) -> GitBranchList {
    tauri::async_runtime::spawn_blocking(move || git_repo_branches_sync(path))
        .await
        .unwrap_or(GitBranchList {
            has_repo: false,
            current: None,
            branches: vec![],
        })
}

fn git_repo_branches_sync(path: String) -> GitBranchList {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return GitBranchList {
            has_repo: false,
            current: None,
            branches: vec![],
        };
    }
    let p = Path::new(trimmed);
    if !p.is_dir() {
        return GitBranchList {
            has_repo: false,
            current: None,
            branches: vec![],
        };
    }

    let inside = run_git(&["rev-parse", "--is-inside-work-tree"], p);
    if inside.as_deref() != Some("true") {
        return GitBranchList {
            has_repo: false,
            current: None,
            branches: vec![],
        };
    }

    let current = run_git(&["branch", "--show-current"], p).filter(|s| !s.is_empty());
    let raw = run_git(
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads/",
        ],
        p,
    )
    .unwrap_or_default();

    let branches: Vec<String> = raw
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .take(80)
        .collect();

    GitBranchList {
        has_repo: true,
        current,
        branches,
    }
}
