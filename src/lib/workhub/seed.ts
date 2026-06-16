import type Database from "@tauri-apps/plugin-sql";
import { hasMeta, setMeta } from "./meta";

type Db = Database;

/** 仅首次安装且表为空时写入演示数据；已有数据的旧库只补写 meta 标记 */
export async function seedTableIfNeeded(
  db: Db,
  metaKey: string,
  table: "projects" | "snippets" | "favorites",
  insertAll: () => Promise<void>,
) {
  if (await hasMeta(db, metaKey)) return;

  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM ${table} LIMIT 1`,
  );
  if (existing.length === 0) await insertAll();

  await setMeta(db, metaKey, "1");
}
