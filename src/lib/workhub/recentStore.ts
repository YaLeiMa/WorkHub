import { reactive } from "vue";
import type { ItemKind, RecentEntry } from "./types";
import { getDb } from "./db";

/** 写入最近使用时携带的元信息（不含 id/at，由 store 生成） */
export interface RecentInput {
  kind: ItemKind;
  refId: string;
  title: string;
  subtitle?: string;
  action: "open" | "copy";
}

export const recentStore = reactive<{ list: RecentEntry[]; loaded: boolean }>({
  list: [],
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function rowToRecent(r: Row): RecentEntry {
  return {
    id: r.id,
    kind: r.kind as ItemKind,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    refId: r.ref_id,
    at: Number(r.created_at),
  };
}

export async function loadRecents() {
  if (recentStore.loaded) return;
  const db = await getDb();
  if (!db) {
    recentStore.list = [];
    recentStore.loaded = true;
    return;
  }
  const rows = await db.select<Row[]>(
    "SELECT * FROM recents ORDER BY created_at DESC LIMIT 10",
  );
  recentStore.list = rows.map(rowToRecent);
  recentStore.loaded = true;
}

/**
 * 记录一次最近使用：同 kind+ref_id 去重（删旧插新），首页取最新 10 条。
 */
export async function recordRecent(input: RecentInput) {
  const entry: RecentEntry = {
    id: `r_${Date.now()}`,
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle,
    refId: input.refId,
    at: Date.now(),
  };

  // 内存去重：移除同 ref 的旧记录，新记录插到最前
  const idx = recentStore.list.findIndex(
    (r) => r.kind === input.kind && r.refId === input.refId,
  );
  if (idx >= 0) recentStore.list.splice(idx, 1);
  recentStore.list.unshift(entry);
  if (recentStore.list.length > 10) recentStore.list.length = 10;

  const db = await getDb();
  if (!db) return;

  await db.execute(
    "DELETE FROM recents WHERE kind = $1 AND ref_id = $2",
    [input.kind, input.refId],
  );
  await db.execute(
    `INSERT INTO recents (id, kind, title, subtitle, ref_id, action, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.id,
      entry.kind,
      entry.title,
      entry.subtitle ?? "",
      entry.refId,
      input.action,
      entry.at,
    ],
  );
  // 清理超出保留量的旧记录
  await db.execute(
    `DELETE FROM recents WHERE id NOT IN (
       SELECT id FROM recents ORDER BY created_at DESC LIMIT 50
     )`,
  );
}

export async function deleteRecent(id: string) {
  const idx = recentStore.list.findIndex((r) => r.id === id);
  if (idx >= 0) recentStore.list.splice(idx, 1);
  const db = await getDb();
  if (db) await db.execute("DELETE FROM recents WHERE id=$1", [id]);
  else throw new Error("database unavailable");
}

export async function clearRecents() {
  recentStore.list = [];
  const db = await getDb();
  if (db) await db.execute("DELETE FROM recents");
  else throw new Error("database unavailable");
}
