import { reactive } from "vue";
import type { LauncherApp } from "./types";
import { getDb } from "./db";

let loading: Promise<void> | null = null;

export const appsStore = reactive<{ list: LauncherApp[]; loaded: boolean }>({
  list: [],
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function rowToApp(r: Row): LauncherApp {
  return {
    id: r.id,
    title: r.title,
    target: r.target,
    sortOrder: Number(r.sort_order ?? 0),
    tags: JSON.parse(r.tags || "[]"),
    updatedAt: Number(r.updated_at),
  };
}

async function insertRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  app: LauncherApp,
) {
  await db.execute(
    `INSERT INTO launcher_apps (id,title,target,sort_order,tags,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      app.id,
      app.title,
      app.target,
      app.sortOrder,
      JSON.stringify(app.tags),
      app.updatedAt,
      app.updatedAt,
    ],
  );
}

export async function loadApps() {
  if (appsStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const db = await getDb();
    if (!db) {
      appsStore.list = [];
      appsStore.loaded = true;
      return;
    }

    const rows = await db.select<Row[]>(
      "SELECT * FROM launcher_apps ORDER BY sort_order ASC, updated_at DESC",
    );
    appsStore.list = rows.map(rowToApp);
    appsStore.loaded = true;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export type LauncherAppFormData = Omit<LauncherApp, "id" | "updatedAt" | "sortOrder"> & {
  sortOrder?: number;
};

export async function createApp(data: LauncherAppFormData) {
  const app: LauncherApp = {
    id: `app_${Date.now()}`,
    title: data.title,
    target: data.target,
    sortOrder: data.sortOrder ?? appsStore.list.length,
    tags: [...data.tags],
    updatedAt: Date.now(),
  };
  appsStore.list.push(app);
  const db = await getDb();
  if (db) await insertRow(db, app);
  else throw new Error("database unavailable");
}

export async function updateApp(id: string, data: LauncherAppFormData) {
  const app = appsStore.list.find((x) => x.id === id);
  if (!app) return;
  app.title = data.title;
  app.target = data.target;
  app.tags = [...data.tags];
  if (data.sortOrder !== undefined) app.sortOrder = data.sortOrder;
  app.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      "UPDATE launcher_apps SET title=$1,target=$2,sort_order=$3,tags=$4,updated_at=$5 WHERE id=$6",
      [
        app.title,
        app.target,
        app.sortOrder,
        JSON.stringify(app.tags),
        app.updatedAt,
        id,
      ],
    );
  else throw new Error("database unavailable");
}

export async function deleteApp(id: string) {
  const idx = appsStore.list.findIndex((a) => a.id === id);
  if (idx >= 0) appsStore.list.splice(idx, 1);
  const db = await getDb();
  if (db) await db.execute("DELETE FROM launcher_apps WHERE id=$1", [id]);
  else throw new Error("database unavailable");
}
