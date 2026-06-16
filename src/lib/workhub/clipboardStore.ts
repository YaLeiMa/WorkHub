import { reactive } from "vue";

import type { ClipboardEntry } from "./types";

import { getDb } from "./db";

import { settingsStore } from "./settingsStore";



/** 堆栈最多固定条数 */

export const CLIPBOARD_STACK_MAX = 5;



export const clipboardStore = reactive<{ list: ClipboardEntry[]; loaded: boolean }>({

  list: [],

  loaded: false,

});



// eslint-disable-next-line @typescript-eslint/no-explicit-any

type Row = any;



const MAX_CONTENT_LEN = 32_768;

const PREVIEW_LEN = 120;



export function makeClipboardPreview(content: string): string {

  const line = content.split(/\r?\n/)[0] ?? content;

  const one = line.replace(/\s+/g, " ").trim();

  if (one.length <= PREVIEW_LEN) return one;

  return `${one.slice(0, PREVIEW_LEN)}…`;

}



function rowToEntry(r: Row): ClipboardEntry {

  return {

    id: r.id,

    content: r.content,

    preview: r.preview,

    createdAt: Number(r.created_at),

    pinned: Number(r.pinned) === 1,

    pinnedAt: Number(r.pinned_at) || 0,

  };

}



export function sortClipboardEntries(list: ClipboardEntry[]): ClipboardEntry[] {

  return [...list].sort((a, b) => {

    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (a.pinned) return b.pinnedAt - a.pinnedAt;

    return b.createdAt - a.createdAt;

  });

}



function resortStore() {

  clipboardStore.list = sortClipboardEntries(clipboardStore.list);

}



export function clipboardPinnedCount(): number {

  return clipboardStore.list.filter((c) => c.pinned).length;

}



export async function loadClipboardHistory() {

  if (clipboardStore.loaded) return;

  const db = await getDb();

  if (!db) {

    clipboardStore.list = [];

    clipboardStore.loaded = true;

    return;

  }

  const max = settingsStore.clipboardHistoryMax;

  const rows = await db.select<Row[]>(

    `SELECT * FROM clipboard_history

     ORDER BY pinned DESC, pinned_at DESC, created_at DESC

     LIMIT $1`,

    [max + CLIPBOARD_STACK_MAX],

  );

  clipboardStore.list = sortClipboardEntries(rows.map(rowToEntry));

  clipboardStore.loaded = true;

}



export async function recordClipboard(content: string) {

  if (!settingsStore.clipboardHistoryEnabled) return;

  const trimmed = content.trim();

  if (!trimmed || trimmed.length > MAX_CONTENT_LEN) return;



  const dupIdx = clipboardStore.list.findIndex((c) => c.content === content);

  if (dupIdx >= 0) {

    const existing = clipboardStore.list[dupIdx]!;

    existing.createdAt = Date.now();

    if (existing.pinned) {

      existing.pinnedAt = Date.now();

    }

    clipboardStore.list.splice(dupIdx, 1);

    clipboardStore.list.unshift(existing);

    resortStore();

    const db = await getDb();

    if (db) {

      await db.execute(

        `UPDATE clipboard_history

         SET created_at = $1, pinned_at = CASE WHEN pinned = 1 THEN $1 ELSE pinned_at END

         WHERE id = $2`,

        [existing.createdAt, existing.id],

      );

    }

    return;

  }



  const entry: ClipboardEntry = {

    id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,

    content,

    preview: makeClipboardPreview(content),

    createdAt: Date.now(),

    pinned: false,

    pinnedAt: 0,

  };



  clipboardStore.list.unshift(entry);

  resortStore();

  const max = settingsStore.clipboardHistoryMax;

  const unpinned = clipboardStore.list.filter((c) => !c.pinned);

  if (unpinned.length > max) {

    const dropIds = new Set(

      unpinned.slice(max).map((c) => c.id),

    );

    clipboardStore.list = clipboardStore.list.filter((c) => !dropIds.has(c.id));

  }



  const db = await getDb();

  if (!db) return;



  await db.execute(

    `INSERT INTO clipboard_history (id, content, preview, created_at, pinned, pinned_at)

     VALUES ($1, $2, $3, $4, 0, 0)`,

    [entry.id, entry.content, entry.preview, entry.createdAt],

  );

  await pruneClipboardHistory(db, max);

}



export async function applyClipboardHistoryMax(max: number) {

  const unpinned = clipboardStore.list.filter((c) => !c.pinned);

  if (unpinned.length > max) {

    const dropIds = new Set(unpinned.slice(max).map((c) => c.id));

    clipboardStore.list = clipboardStore.list.filter((c) => !dropIds.has(c.id));

  }

  const db = await getDb();

  if (db) await pruneClipboardHistory(db, max);

}



async function pruneClipboardHistory(

  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,

  max: number,

) {

  await db.execute(

    `DELETE FROM clipboard_history WHERE pinned = 0 AND id NOT IN (

       SELECT id FROM clipboard_history WHERE pinned = 0 ORDER BY created_at DESC LIMIT $1

     )`,

    [max],

  );

}



export async function toggleClipboardPin(id: string) {

  const item = clipboardStore.list.find((c) => c.id === id);

  if (!item) return;



  if (!item.pinned && clipboardPinnedCount() >= CLIPBOARD_STACK_MAX) {

    throw new Error("CLIPBOARD_STACK_FULL");

  }



  item.pinned = !item.pinned;

  item.pinnedAt = item.pinned ? Date.now() : 0;

  resortStore();



  const db = await getDb();

  if (db) {
    await db.execute(
      "UPDATE clipboard_history SET pinned = $1, pinned_at = $2 WHERE id = $3",
      [item.pinned ? 1 : 0, item.pinnedAt, id],
    );
  }
}



export async function deleteClipboardEntry(id: string) {

  const idx = clipboardStore.list.findIndex((c) => c.id === id);

  if (idx >= 0) clipboardStore.list.splice(idx, 1);

  const db = await getDb();

  if (db) await db.execute("DELETE FROM clipboard_history WHERE id = $1", [id]);

  else throw new Error("database unavailable");

}



/** 仅清空未固定的历史记录，堆栈项保留 */

export async function clearClipboardHistory() {

  clipboardStore.list = clipboardStore.list.filter((c) => c.pinned);

  const db = await getDb();

  if (db) await db.execute("DELETE FROM clipboard_history WHERE pinned = 0");

  else throw new Error("database unavailable");

}



export function clipboardHistoryCount(): number {

  return clipboardStore.list.filter((c) => !c.pinned).length;

}


