import type Database from "@tauri-apps/plugin-sql";

// 是否运行在 Tauri 桌面环境（否则为浏览器，store 走内存降级）
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let dbPromise: Promise<Database> | null = null;

/**
 * 获取 SQLite 连接（单例）。浏览器环境返回 null，调用方需走内存降级。
 * 数据库文件：%APPDATA%/com.workhub.app/workhub.db（Windows），建表由 Rust 端迁移完成。
 */
export async function getDb(): Promise<Database | null> {
  if (!inTauri()) return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      const mod = await import("@tauri-apps/plugin-sql");
      return mod.default.load("sqlite:workhub.db");
    })();
  }
  return dbPromise;
}
