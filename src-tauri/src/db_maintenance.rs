use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OpenFlags};

use crate::startup_log;

fn wal_path(db_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-wal", db_path.to_string_lossy()))
}

fn shm_path(db_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-shm", db_path.to_string_lossy()))
}

fn remove_wal_shm(db_path: &Path) {
    let _ = std::fs::remove_file(wal_path(db_path));
    let _ = std::fs::remove_file(shm_path(db_path));
}

fn corrupt_backup_path(db_path: &Path) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    db_path.with_extension(format!("corrupt.{ts}.db"))
}

fn open_db(db_path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|e| format!("open failed: {e}"))
}

fn checkpoint_and_check(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")
        .map_err(|e| format!("wal_checkpoint failed: {e}"))?;

    let check: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("integrity_check failed: {e}"))?;

    if check != "ok" {
        return Err(format!("integrity_check: {check}"));
    }
    Ok(())
}

/// DELETE 模式：数据直接写入主库，不依赖 WAL 文件，更适合「直接关机」场景。
fn apply_safe_pragmas(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "DELETE")
        .map_err(|e| format!("journal_mode failed: {e}"))?;
    conn.pragma_update(None, "synchronous", "FULL")
        .map_err(|e| format!("synchronous failed: {e}"))?;
    Ok(())
}

fn finalize_open(conn: &Connection) -> Result<(), String> {
    checkpoint_and_check(conn)?;
    apply_safe_pragmas(conn)?;
    Ok(())
}

fn backup_corrupt_db(db_path: &Path) -> Result<PathBuf, String> {
    remove_wal_shm(db_path);
    let backup = corrupt_backup_path(db_path);
    std::fs::rename(db_path, &backup).map_err(|e| format!("backup rename failed: {e}"))?;
    Ok(backup)
}

/// 启动前维护：WAL 整理、完整性检查；损坏时自动备份并重建空库。
pub fn prepare_database() {
    let Some(dir) = startup_log::log_dir() else {
        startup_log::write("db: skip (no app data dir)");
        return;
    };

    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("workhub.db");

    if !db_path.exists() {
        startup_log::write("db: creating new database with safe journal mode");
        if let Ok(conn) = open_db(&db_path) {
            let _ = apply_safe_pragmas(&conn);
        }
        return;
    }

    match maintain_existing_db(&db_path) {
        Ok(()) => startup_log::write("db: prepare ok"),
        Err(e) => startup_log::write(&format!("db: prepare error: {e}")),
    }
}

fn maintain_existing_db(db_path: &Path) -> Result<(), String> {
    if let Ok(conn) = open_db(db_path) {
        if finalize_open(&conn).is_ok() {
            startup_log::write("db: journal_mode=DELETE active");
            return Ok(());
        }
    }

    startup_log::write("db: first pass failed, clearing wal/shm");
    remove_wal_shm(db_path);

    if let Ok(conn) = open_db(db_path) {
        if finalize_open(&conn).is_ok() {
            startup_log::write("db: recovered after wal/shm cleanup");
            return Ok(());
        }
    }

    let backup = backup_corrupt_db(db_path)?;
    startup_log::write(&format!(
        "db: corrupt database moved to {}",
        backup.display()
    ));
    startup_log::write("db: a fresh database will be created on next open");
    Ok(())
}

/// 退出 / 关机前刷盘（尽量缩短异常关机时的数据窗口）。
pub fn checkpoint_on_exit() {
    let Some(dir) = startup_log::log_dir() else {
        return;
    };
    let db_path = dir.join("workhub.db");
    if !db_path.exists() {
        return;
    }
    if let Ok(conn) = open_db(&db_path) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;");
        startup_log::write("db: exit flush ok");
    }
}

/// 供前端在页面卸载前调用（直接关机时 Rust Exit 事件可能来不及跑）。
#[tauri::command]
pub fn db_checkpoint() {
    checkpoint_on_exit();
}
