import { reactive } from "vue";
import { mockFavorites } from "./mock";
import type { Favorite } from "./types";
import { getDb } from "./db";
import { seedTableIfNeeded } from "./seed";

const SEED_KEY = "seed_favorites_v1";
let loading: Promise<void> | null = null;

// 文件收藏 store（桌面端落 SQLite，浏览器端内存降级）
export const favoritesStore = reactive<{ list: Favorite[]; loaded: boolean }>({
  list: [],
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function rowToFavorite(r: Row): Favorite {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    target: r.target,
    tags: JSON.parse(r.tags || "[]"),
    updatedAt: Number(r.updated_at),
  };
}

async function insertRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  f: Favorite,
) {
  await db.execute(
    `INSERT INTO favorites (id,kind,title,target,tags,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      f.id,
      f.kind,
      f.title,
      f.target,
      JSON.stringify(f.tags),
      f.updatedAt,
      f.updatedAt,
    ],
  );
}

export async function loadFavorites() {
  if (favoritesStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const db = await getDb();
    if (!db) {
      favoritesStore.list = mockFavorites.map((f) => ({ ...f, tags: [...f.tags] }));
      favoritesStore.loaded = true;
      return;
    }

    await seedTableIfNeeded(db, SEED_KEY, "favorites", async () => {
      for (const f of mockFavorites) await insertRow(db, f);
    });

    const rows = await db.select<Row[]>(
      "SELECT * FROM favorites ORDER BY updated_at DESC",
    );
    favoritesStore.list = rows.map(rowToFavorite);
    favoritesStore.loaded = true;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export type FavoriteFormData = Omit<Favorite, "id" | "updatedAt">;

export async function createFavorite(data: FavoriteFormData) {
  const f: Favorite = {
    id: `f_${Date.now()}`,
    ...data,
    tags: [...data.tags],
    updatedAt: Date.now(),
  };
  favoritesStore.list.unshift(f);
  const db = await getDb();
  if (db) await insertRow(db, f);
  else throw new Error("database unavailable");
}

export async function updateFavorite(id: string, data: FavoriteFormData) {
  const f = favoritesStore.list.find((x) => x.id === id);
  if (!f) return;
  f.kind = data.kind;
  f.title = data.title;
  f.target = data.target;
  f.tags = [...data.tags];
  f.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      "UPDATE favorites SET kind=$1,title=$2,target=$3,tags=$4,updated_at=$5 WHERE id=$6",
      [f.kind, f.title, f.target, JSON.stringify(f.tags), f.updatedAt, id],
    );
  else throw new Error("database unavailable");
}

export async function deleteFavorite(id: string) {
  const idx = favoritesStore.list.findIndex((f) => f.id === id);
  if (idx >= 0) favoritesStore.list.splice(idx, 1);
  const db = await getDb();
  if (db) await db.execute("DELETE FROM favorites WHERE id=$1", [id]);
  else throw new Error("database unavailable");
}
