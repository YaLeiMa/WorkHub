import { reactive } from "vue";
import { mockSnippets } from "./mock";
import type { Snippet } from "./types";
import { getDb } from "./db";
import { deleteVariableMemoryForSnippet } from "./snippetVariableMemory";
import { seedTableIfNeeded } from "./seed";

const SEED_KEY = "seed_snippets_v1";
let loading: Promise<void> | null = null;

// 代码片段 store（桌面端落 SQLite，浏览器端内存降级）
export const snippetsStore = reactive<{ list: Snippet[]; loaded: boolean }>({
  list: [],
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function rowToSnippet(r: Row): Snippet {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    language: r.language ?? "",
    tags: JSON.parse(r.tags || "[]"),
    code: r.code,
    favorite: !!r.is_favorite,
    updatedAt: Number(r.updated_at),
  };
}

async function insertRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  s: Snippet,
) {
  await db.execute(
    `INSERT INTO snippets
      (id,title,description,category,language,tags,code,is_favorite,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      s.id,
      s.title,
      "",
      s.category,
      s.language,
      JSON.stringify(s.tags),
      s.code,
      s.favorite ? 1 : 0,
      s.updatedAt,
      s.updatedAt,
    ],
  );
}

export async function loadSnippets() {
  if (snippetsStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const db = await getDb();
    if (!db) {
      snippetsStore.list = mockSnippets.map((s) => ({ ...s, tags: [...s.tags] }));
      snippetsStore.loaded = true;
      return;
    }

    await seedTableIfNeeded(db, SEED_KEY, "snippets", async () => {
      for (const s of mockSnippets) await insertRow(db, s);
    });

    const rows = await db.select<Row[]>(
      "SELECT * FROM snippets ORDER BY updated_at DESC",
    );
    snippetsStore.list = rows.map(rowToSnippet);
    snippetsStore.loaded = true;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export function getSnippet(id: string): Snippet | undefined {
  return snippetsStore.list.find((s) => s.id === id);
}

let pendingEditId: string | null = null;

/** 从列表进入详情并自动打开编辑态 */
export function openSnippetEditor(id: string) {
  pendingEditId = id;
}

export function consumeSnippetPendingEdit(id: string): boolean {
  if (pendingEditId !== id) return false;
  pendingEditId = null;
  return true;
}

export async function toggleSnippetFavorite(id: string) {
  const s = getSnippet(id);
  if (!s) return;
  s.favorite = !s.favorite;
  const db = await getDb();
  if (db)
    await db.execute("UPDATE snippets SET is_favorite=$1 WHERE id=$2", [
      s.favorite ? 1 : 0,
      id,
    ]);
}

export type SnippetEditData = Pick<
  Snippet,
  "title" | "category" | "language" | "tags" | "code"
>;

export async function createSnippet(data: SnippetEditData) {
  const s: Snippet = {
    id: `snippet_${Date.now()}`,
    ...data,
    tags: [...data.tags],
    favorite: false,
    updatedAt: Date.now(),
  };
  snippetsStore.list.unshift(s);
  const db = await getDb();
  if (db) await insertRow(db, s);
  return s;
}

export async function deleteSnippet(id: string) {
  const idx = snippetsStore.list.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("snippet not found");
  snippetsStore.list.splice(idx, 1);
  const db = await getDb();
  if (db) await db.execute("DELETE FROM snippets WHERE id=$1", [id]);
  await deleteVariableMemoryForSnippet(id);
}

export async function updateSnippet(id: string, data: SnippetEditData) {
  const s = getSnippet(id);
  if (!s) throw new Error("snippet not found");
  s.title = data.title;
  s.category = data.category;
  s.language = data.language;
  s.tags = [...data.tags];
  s.code = data.code;
  s.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      "UPDATE snippets SET title=$1,category=$2,language=$3,tags=$4,code=$5,updated_at=$6 WHERE id=$7",
      [s.title, s.category, s.language, JSON.stringify(s.tags), s.code, s.updatedAt, id],
    );
}
