import { getDb } from "./db";
import type { SnippetVariable } from "./snippetVariables";

/** 跨片段共享的变量记忆（同名变量回退） */
export const SNIPPET_VAR_GLOBAL_ID = "*";

const LS_KEY = "workhub_snippet_var_memory";

function lsRead(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function lsWrite(data: Record<string, string>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function storageKey(snippetId: string, name: string) {
  return `${snippetId}\0${name}`;
}

async function readValue(
  snippetId: string,
  name: string,
): Promise<string | undefined> {
  const db = await getDb();
  if (db) {
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM snippet_variable_values WHERE snippet_id = $1 AND name = $2",
      [snippetId, name],
    );
    return rows[0]?.value;
  }
  const all = lsRead();
  const v = all[storageKey(snippetId, name)];
  return v !== undefined ? v : undefined;
}

async function upsertValue(snippetId: string, name: string, value: string) {
  const now = Date.now();
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT INTO snippet_variable_values (snippet_id, name, value, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(snippet_id, name) DO UPDATE SET value = $3, updated_at = $4`,
      [snippetId, name, value, now],
    );
    return;
  }
  const all = lsRead();
  all[storageKey(snippetId, name)] = value;
  lsWrite(all);
}

/** 打开变量弹窗时的初始值：片段记忆 → 全局记忆 → 默认值 */
export async function loadInitialVariableValues(
  snippetId: string,
  variables: SnippetVariable[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const v of variables) {
    const snippetVal = await readValue(snippetId, v.name);
    if (snippetVal !== undefined) {
      out[v.name] = snippetVal;
      continue;
    }
    const globalVal = await readValue(SNIPPET_VAR_GLOBAL_ID, v.name);
    if (globalVal !== undefined) {
      out[v.name] = globalVal;
      continue;
    }
    out[v.name] = v.defaultValue;
  }
  return out;
}

/** 确认复制后写入片段级 + 全局记忆 */
export async function saveVariableValues(
  snippetId: string,
  values: Record<string, string>,
) {
  const names = Object.keys(values);
  await Promise.all(
    names.flatMap((name) => [
      upsertValue(snippetId, name, values[name] ?? ""),
      upsertValue(SNIPPET_VAR_GLOBAL_ID, name, values[name] ?? ""),
    ]),
  );
}

export async function deleteVariableMemoryForSnippet(snippetId: string) {
  const db = await getDb();
  if (db) {
    await db.execute(
      "DELETE FROM snippet_variable_values WHERE snippet_id = $1",
      [snippetId],
    );
    return;
  }
  const all = lsRead();
  const prefix = `${snippetId}\0`;
  for (const key of Object.keys(all)) {
    if (key.startsWith(prefix)) delete all[key];
  }
  lsWrite(all);
}

export async function clearAllVariableMemory() {
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM snippet_variable_values");
    return;
  }
  if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
}
