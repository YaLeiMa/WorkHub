import type Database from "@tauri-apps/plugin-sql";

type Db = Database;

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_meta WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function hasMeta(db: Db, key: string): Promise<boolean> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_meta WHERE key = $1",
    [key],
  );
  return rows.length > 0;
}

export async function setMeta(db: Db, key: string, value: string) {
  await db.execute(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value],
  );
}
