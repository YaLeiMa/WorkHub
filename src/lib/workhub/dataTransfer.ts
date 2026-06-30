import { clearAllVariableMemory } from "./snippetVariableMemory";
import { getDb, inTauri } from "./db";
import { setMeta } from "./meta";
import { mockFavorites, mockProjects, mockSnippets } from "./mock";
import { normalizeGroupPath } from "./projectGroups";
import { favoritesStore } from "./favoritesStore";
import { appsStore } from "./appsStore";
import { reloadWorkhubData } from "./init";
import { projectsStore } from "./projectsStore";
import { recentStore } from "./recentStore";
import { snippetsStore } from "./snippetsStore";
import type { Favorite, LauncherApp, Project, Snippet, SnippetCategory } from "./types";

export const WORKHUB_EXPORT_FORMAT = "workhub-backup" as const;
export const WORKHUB_EXPORT_VERSION = 2;
const SUPPORTED_EXPORT_VERSIONS = [1, 2] as const;

const GROUP_ORDER_KEY = "project_group_order";
const CHILD_ORDER_KEY = "project_group_child_order";
const SEED_KEYS = [
  "seed_projects_v1",
  "seed_snippets_v1",
  "seed_favorites_v1",
] as const;

export type WorkhubExportFile = {
  format: typeof WORKHUB_EXPORT_FORMAT;
  version: typeof WORKHUB_EXPORT_VERSION;
  exportedAt: number;
  projects: Project[];
  snippets: Snippet[];
  favorites: Favorite[];
  apps: LauncherApp[];
  projectGroupOrder: string[];
  projectGroupChildOrder: Record<string, string[]>;
};

export class DataTransferCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "DataTransferCancelledError";
  }
}

function formatBackupDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function defaultBackupName() {
  return `workhub-backup-${formatBackupDate(new Date())}.json`;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function cloneProject(p: Project): Project {
  return {
    ...p,
    group: normalizeGroupPath(p.group),
    tags: [...p.tags],
    links: p.links.map((l) => ({ ...l })),
    commands: p.commands.map((c) => ({ ...c })),
    docs: p.docs.map((d) => ({ ...d })),
  };
}

function cloneSnippet(s: Snippet): Snippet {
  return { ...s, tags: [...s.tags] };
}

function cloneFavorite(f: Favorite): Favorite {
  return { ...f, tags: [...f.tags] };
}

function cloneApp(a: LauncherApp): LauncherApp {
  return { ...a, tags: [...a.tags] };
}

const SNIPPET_CATEGORIES: SnippetCategory[] = [
  "shell",
  "git",
  "sql",
  "代码",
  "正则",
  "颜色",
  "符号",
  "其他",
];

const LEGACY_SNIPPET_CATEGORIES: Record<string, SnippetCategory> = {
  代码片段: "代码",
};

const FAVORITE_KINDS: Favorite["kind"][] = ["file", "folder", "link", "doc"];

function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  return {
    id: o.id,
    name: o.name,
    description: typeof o.description === "string" ? o.description : "",
    path: typeof o.path === "string" ? o.path : "",
    gitUrl: typeof o.gitUrl === "string" ? o.gitUrl : "",
    group: normalizeGroupPath(typeof o.group === "string" ? o.group : ""),
    sortOrder: Number(o.sortOrder ?? 0),
    tags: parseStringArray(o.tags),
    favorite: !!o.favorite,
    updatedAt: Number(o.updatedAt ?? Date.now()),
    links: Array.isArray(o.links)
      ? o.links
          .filter((l) => l && typeof l === "object")
          .map((l) => {
            const x = l as Record<string, unknown>;
            return {
              id: String(x.id ?? `l_${Date.now()}`),
              title: String(x.title ?? ""),
              url: String(x.url ?? ""),
            };
          })
      : [],
    commands: Array.isArray(o.commands)
      ? o.commands
          .filter((c) => c && typeof c === "object")
          .map((c) => {
            const x = c as Record<string, unknown>;
            return {
              id: String(x.id ?? `c_${Date.now()}`),
              title: String(x.title ?? ""),
              command: String(x.command ?? ""),
            };
          })
      : [],
    docs: Array.isArray(o.docs)
      ? o.docs
          .filter((d) => d && typeof d === "object")
          .map((d) => {
            const x = d as Record<string, unknown>;
            return {
              id: String(x.id ?? `d_${Date.now()}`),
              title: String(x.title ?? ""),
              path: String(x.path ?? ""),
            };
          })
      : [],
  };
}

function normalizeSnippet(raw: unknown): Snippet | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  const rawCategory = String(o.category ?? "其他");
  const mapped = LEGACY_SNIPPET_CATEGORIES[rawCategory] ?? rawCategory;
  return {
    id: o.id,
    title: o.title,
    category: SNIPPET_CATEGORIES.includes(mapped as SnippetCategory)
      ? (mapped as SnippetCategory)
      : "其他",
    language: typeof o.language === "string" ? o.language : "",
    tags: parseStringArray(o.tags),
    code: typeof o.code === "string" ? o.code : "",
    favorite: !!o.favorite,
    updatedAt: Number(o.updatedAt ?? Date.now()),
  };
}

function normalizeFavorite(raw: unknown): Favorite | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  const kind = String(o.kind ?? "link");
  return {
    id: o.id,
    kind: FAVORITE_KINDS.includes(kind as Favorite["kind"])
      ? (kind as Favorite["kind"])
      : "link",
    title: o.title,
    target: typeof o.target === "string" ? o.target : "",
    tags: parseStringArray(o.tags),
    updatedAt: Number(o.updatedAt ?? Date.now()),
  };
}

function normalizeApp(raw: unknown): LauncherApp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  return {
    id: o.id,
    title: o.title,
    target: typeof o.target === "string" ? o.target : "",
    sortOrder: Number(o.sortOrder ?? 0),
    tags: parseStringArray(o.tags),
    updatedAt: Number(o.updatedAt ?? Date.now()),
  };
}

function normalizeChildOrder(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key) continue;
    out[key] = parseStringArray(list);
  }
  return out;
}

export function buildExportPayload(): WorkhubExportFile {
  return {
    format: WORKHUB_EXPORT_FORMAT,
    version: WORKHUB_EXPORT_VERSION,
    exportedAt: Date.now(),
    projects: projectsStore.list.map(cloneProject),
    snippets: snippetsStore.list.map(cloneSnippet),
    favorites: favoritesStore.list.map(cloneFavorite),
    apps: appsStore.list.map(cloneApp),
    projectGroupOrder: [...projectsStore.groupOrder],
    projectGroupChildOrder: { ...projectsStore.childGroupOrder },
  };
}

export function parseExportFile(text: string): WorkhubExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("备份文件格式不正确");
  }
  const o = parsed as Record<string, unknown>;
  if (o.format !== WORKHUB_EXPORT_FORMAT) {
    throw new Error("不是 WorkHub 备份文件");
  }
  const version = Number(o.version);
  if (!SUPPORTED_EXPORT_VERSIONS.includes(version as 1 | 2)) {
    throw new Error(`不支持的备份版本：${String(o.version)}`);
  }

  const projects = Array.isArray(o.projects)
    ? o.projects.map(normalizeProject).filter((p): p is Project => !!p)
    : [];
  const snippets = Array.isArray(o.snippets)
    ? o.snippets.map(normalizeSnippet).filter((s): s is Snippet => !!s)
    : [];
  const favorites = Array.isArray(o.favorites)
    ? o.favorites.map(normalizeFavorite).filter((f): f is Favorite => !!f)
    : [];
  const apps =
    version >= 2 && Array.isArray(o.apps)
      ? o.apps.map(normalizeApp).filter((a): a is LauncherApp => !!a)
      : [];

  return {
    format: WORKHUB_EXPORT_FORMAT,
    version: WORKHUB_EXPORT_VERSION,
    exportedAt: Number(o.exportedAt ?? Date.now()),
    projects,
    snippets,
    favorites,
    apps,
    projectGroupOrder: parseStringArray(o.projectGroupOrder),
    projectGroupChildOrder: normalizeChildOrder(o.projectGroupChildOrder),
  };
}

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickJsonFromBrowser(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new DataTransferCancelledError());
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsText(file, "utf-8");
    };
    input.oncancel = () => reject(new DataTransferCancelledError());
    input.click();
  });
}

async function insertProjectRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  p: Project,
) {
  await db.execute(
    `INSERT INTO projects
      (id,name,description,path,git_url,group_name,sort_order,tags,is_favorite,links,commands,docs,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      p.id,
      p.name,
      p.description,
      p.path,
      p.gitUrl ?? "",
      normalizeGroupPath(p.group),
      p.sortOrder,
      JSON.stringify(p.tags),
      p.favorite ? 1 : 0,
      JSON.stringify(p.links),
      JSON.stringify(p.commands),
      JSON.stringify(p.docs),
      p.updatedAt,
      p.updatedAt,
    ],
  );
}

async function insertSnippetRow(
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

async function insertFavoriteRow(
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

async function insertAppRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  a: LauncherApp,
) {
  await db.execute(
    `INSERT INTO launcher_apps (id,title,target,sort_order,tags,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      a.id,
      a.title,
      a.target,
      a.sortOrder,
      JSON.stringify(a.tags),
      a.updatedAt,
      a.updatedAt,
    ],
  );
}

function applyToMemory(payload: WorkhubExportFile) {
  projectsStore.list = payload.projects.map(cloneProject);
  projectsStore.groupOrder = [...payload.projectGroupOrder];
  projectsStore.childGroupOrder = { ...payload.projectGroupChildOrder };
  snippetsStore.list = payload.snippets.map(cloneSnippet);
  favoritesStore.list = payload.favorites.map(cloneFavorite);
  appsStore.list = payload.apps.map(cloneApp);
  recentStore.list = [];
}

async function persistPayload(payload: WorkhubExportFile) {
  const db = await getDb();
  if (!db) {
    applyToMemory(payload);
    return;
  }

  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM snippets");
  await db.execute("DELETE FROM favorites");
  await db.execute("DELETE FROM launcher_apps");
  await db.execute("DELETE FROM recents");

  for (const p of payload.projects) await insertProjectRow(db, p);
  for (const s of payload.snippets) await insertSnippetRow(db, s);
  for (const f of payload.favorites) await insertFavoriteRow(db, f);
  for (const a of payload.apps) await insertAppRow(db, a);

  await setMeta(db, GROUP_ORDER_KEY, JSON.stringify(payload.projectGroupOrder));
  await setMeta(
    db,
    CHILD_ORDER_KEY,
    JSON.stringify(payload.projectGroupChildOrder),
  );
}

export async function applyImport(payload: WorkhubExportFile) {
  await persistPayload(payload);
  await reloadWorkhubData();
}

export async function exportWorkhubData(): Promise<void> {
  const payload = buildExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const filename = defaultBackupName();

  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: "导出 WorkHub 数据",
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: filename,
    });
    if (!path) throw new DataTransferCancelledError();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_text_file", { path, contents: json });
    return;
  }

  downloadJson(filename, json);
}

export async function importWorkhubData(): Promise<void> {
  let text: string;
  if (inTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      title: "导入 WorkHub 数据",
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") throw new DataTransferCancelledError();
    const { invoke } = await import("@tauri-apps/api/core");
    text = await invoke<string>("read_text_file", { path });
  } else {
    text = await pickJsonFromBrowser();
  }

  const payload = parseExportFile(text);
  await applyImport(payload);
}

async function seedFactoryRows(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  for (const p of mockProjects) await insertProjectRow(db, p);
  for (const s of mockSnippets) await insertSnippetRow(db, s);
  for (const f of mockFavorites) await insertFavoriteRow(db, f);
  for (const key of SEED_KEYS) await setMeta(db, key, "1");
}

export async function resetFactoryData(): Promise<void> {
  const db = await getDb();
  if (!db) {
    applyToMemory({
      format: WORKHUB_EXPORT_FORMAT,
      version: WORKHUB_EXPORT_VERSION,
      exportedAt: Date.now(),
      projects: mockProjects.map(cloneProject),
      snippets: mockSnippets.map(cloneSnippet),
      favorites: mockFavorites.map(cloneFavorite),
      apps: [],
      projectGroupOrder: [],
      projectGroupChildOrder: {},
    });
    await reloadWorkhubData();
    await clearAllVariableMemory();
    return;
  }

  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM snippets");
  await db.execute("DELETE FROM favorites");
  await db.execute("DELETE FROM launcher_apps");
  await db.execute("DELETE FROM recents");
  await db.execute("DELETE FROM clipboard_history");
  await db.execute("DELETE FROM snippet_variable_values");
  await db.execute(`DELETE FROM app_meta WHERE key IN ($1, $2)`, [
    GROUP_ORDER_KEY,
    CHILD_ORDER_KEY,
  ]);
  for (const key of SEED_KEYS) {
    await db.execute("DELETE FROM app_meta WHERE key = $1", [key]);
  }

  await seedFactoryRows(db);
  await reloadWorkhubData();
}

export function isDataTransferCancelled(err: unknown) {
  return err instanceof DataTransferCancelledError;
}
