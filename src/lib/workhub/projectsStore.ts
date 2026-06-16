import { reactive } from "vue";
import { mockProjects } from "./mock";
import type { Project } from "./types";
import { getDb } from "./db";
import { seedTableIfNeeded } from "./seed";
import { getMeta, setMeta } from "./meta";
import {
  GROUP_PATH_SEP,
  decodeGroupParent,
  ROOT_GROUP_PARENT,
  buildProjectGroupTree,
  collectGroupPaths,
  formatGroupPath,
  normalizeGroupPath,
  parentGroupPath,
  lastGroupSegment,
  parseGroupPath,
  projectGroupKey,
  projectGroupLabel,
  validateGroupPath,
  type ProjectGroupNode,
} from "./projectGroups";

const SEED_KEY = "seed_projects_v1";
const GROUP_ORDER_META_KEY = "project_group_order";
const CHILD_ORDER_META_KEY = "project_group_child_order";
let loading: Promise<void> | null = null;

export {
  projectGroupKey,
  projectGroupLabel,
  validateGroupPath,
  normalizeGroupPath,
  parentGroupPath,
  parseGroupPath,
  formatGroupPath,
  lastGroupSegment,
  type ProjectGroupNode,
};

// 项目数据 store（桌面端落 SQLite，浏览器端内存降级）
export const projectsStore = reactive<{
  list: Project[];
  /** 顶层分组顺序（父级 segment） */
  groupOrder: string[];
  /** 各父路径下的子分组顺序 */
  childGroupOrder: Record<string, string[]>;
  loaded: boolean;
}>({
  list: [],
  groupOrder: [],
  childGroupOrder: {},
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToProject(r: Row): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    path: r.path,
    gitUrl: r.git_url ?? "",
    group: normalizeGroupPath(r.group_name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    tags: parseJsonStringArray(r.tags),
    favorite: !!r.is_favorite,
    updatedAt: Number(r.updated_at),
    links: JSON.parse(r.links || "[]"),
    commands: JSON.parse(r.commands || "[]"),
    docs: JSON.parse(r.docs || "[]"),
  };
}

async function insertRow(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, p: Project) {
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

function normalizeSegmentList(
  items: string[],
  parentPath: string,
): string[] {
  const parent = projectGroupKey(parentPath);
  const out: string[] = [];
  for (const item of items) {
    let seg = item;
    if (seg.includes(GROUP_PATH_SEP)) {
      const parts = parseGroupPath(seg);
      if (parent === "") seg = parts[0] ?? seg;
      else if (seg.startsWith(`${parent}${GROUP_PATH_SEP}`)) {
        seg = parts[parseGroupPath(parent).length] ?? lastGroupSegment(seg);
      } else {
        seg = lastGroupSegment(seg);
      }
    }
    if (seg && !out.includes(seg)) out.push(seg);
  }
  return out;
}

function normalizeChildGroupOrder(
  raw: Record<string, string[]>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(raw)) {
    const parent = decodeGroupParent(key);
    if (!parent) continue;
    next[parent] = normalizeSegmentList(list, parent);
  }
  return next;
}

function rootSegmentsFromPaths(paths: string[]): string[] {
  const set = new Set<string>();
  const order: string[] = [];
  for (const path of paths) {
    const first = parseGroupPath(path)[0];
    if (first && !set.has(first)) {
      set.add(first);
      order.push(first);
    }
  }
  return order;
}

function syncGroupOrderKeys() {
  const paths = collectGroupPaths(projectsStore.list);
  const roots = rootSegmentsFromPaths(paths);

  let order = normalizeSegmentList(
    projectsStore.groupOrder.filter((seg) => roots.includes(seg)),
    "",
  );
  for (const seg of roots) {
    if (!order.includes(seg)) order.push(seg);
  }
  if (order.length === 0 && roots.length > 0) {
    order = [...roots].sort((a, b) => a.localeCompare(b, "zh"));
  }
  projectsStore.groupOrder = order;

  const parentPaths = new Set<string>([""]);
  for (const path of paths) {
    const parts = parseGroupPath(path);
    for (let i = 0; i < parts.length; i++) {
      parentPaths.add(formatGroupPath(parts.slice(0, i)));
    }
  }

  const childOrder = { ...projectsStore.childGroupOrder };
  delete childOrder[""];
  delete childOrder[ROOT_GROUP_PARENT];
  for (const parentPath of parentPaths) {
    if (!parentPath) continue;
    const parentDepth = parseGroupPath(parentPath).length;
    const segments = new Set<string>();
    for (const p of projectsStore.list) {
      const parts = parseGroupPath(p.group);
      if (parts.length <= parentDepth) continue;
      const pParent = formatGroupPath(parts.slice(0, parentDepth));
      if (pParent === parentPath) segments.add(parts[parentDepth]!);
    }
    const merged = normalizeSegmentList(
      [...(childOrder[parentPath] ?? [])],
      parentPath,
    );
    for (const seg of segments) {
      if (!merged.includes(seg)) merged.push(seg);
    }
    childOrder[parentPath] = merged;
  }
  projectsStore.childGroupOrder = childOrder;
}

function normalizeSortOrdersInMemory() {
  const byGroup = new Map<string, Project[]>();
  for (const p of projectsStore.list) {
    const k = projectGroupKey(p.group);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(p);
  }
  for (const items of byGroup.values()) {
    items.sort(
      (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt,
    );
    items.forEach((p, i) => {
      p.sortOrder = i;
    });
  }
}

async function loadGroupOrder(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const raw = await getMeta(db, GROUP_ORDER_META_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.every((x) => typeof x === "string" && !x.includes(GROUP_PATH_SEP))) {
          projectsStore.groupOrder = normalizeSegmentList(parsed.map(String), "");
        } else {
          projectsStore.groupOrder = rootSegmentsFromPaths(parsed.map(String));
        }
      }
    } catch {
      /* fall through */
    }
  }

  const childRaw = await getMeta(db, CHILD_ORDER_META_KEY);
  if (childRaw) {
    try {
      const parsed = JSON.parse(childRaw);
      if (parsed && typeof parsed === "object") {
        projectsStore.childGroupOrder = normalizeChildGroupOrder(
          parsed as Record<string, string[]>,
        );
      }
    } catch {
      /* fall through */
    }
  }

  syncGroupOrderKeys();
  await persistGroupOrder(db);
}

async function persistGroupOrder(db?: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const conn = db ?? (await getDb());
  if (!conn) return;
  await setMeta(conn, GROUP_ORDER_META_KEY, JSON.stringify(projectsStore.groupOrder));
  await setMeta(
    conn,
    CHILD_ORDER_META_KEY,
    JSON.stringify(projectsStore.childGroupOrder),
  );
}

async function persistProjectSortOrders(
  projects: Project[],
  db?: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const conn = db ?? (await getDb());
  if (!conn) return;
  for (const p of projects) {
    await conn.execute(
      "UPDATE projects SET group_name=$1, sort_order=$2, updated_at=$3 WHERE id=$4",
      [p.group.trim(), p.sortOrder, p.updatedAt, p.id],
    );
  }
}

export function groupProjects(projects: Project[]): ProjectGroupNode[] {
  return buildProjectGroupTree(
    projects,
    projectsStore.groupOrder,
    projectsStore.childGroupOrder,
  );
}

function remapGroupPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  const k = projectGroupKey(path);
  if (k === oldPrefix) return newPrefix;
  if (k.startsWith(`${oldPrefix}${GROUP_PATH_SEP}`)) {
    return newPrefix + k.slice(oldPrefix.length);
  }
  return k;
}

export async function loadProjects() {
  if (projectsStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const db = await getDb();
    if (!db) {
      projectsStore.list = mockProjects.map((p) => ({
        ...p,
        tags: [...p.tags],
      }));
      normalizeSortOrdersInMemory();
      syncGroupOrderKeys();
      projectsStore.loaded = true;
      return;
    }

    await seedTableIfNeeded(db, SEED_KEY, "projects", async () => {
      for (const p of mockProjects) await insertRow(db, p);
    });

    const rows = await db.select<Row[]>(
      "SELECT * FROM projects ORDER BY updated_at DESC",
    );
    projectsStore.list = rows.map(rowToProject);
    normalizeSortOrdersInMemory();
    await loadGroupOrder(db);
    await persistProjectSortOrders(projectsStore.list, db);
    projectsStore.loaded = true;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export function getProject(id: string): Project | undefined {
  return projectsStore.list.find((p) => p.id === id);
}

export async function toggleFavorite(id: string) {
  const p = getProject(id);
  if (!p) return;
  p.favorite = !p.favorite;
  const db = await getDb();
  if (db)
    await db.execute("UPDATE projects SET is_favorite=$1 WHERE id=$2", [
      p.favorite ? 1 : 0,
      id,
    ]);
}

export type ProjectFormData = Pick<
  Project,
  "name" | "description" | "path" | "gitUrl" | "group" | "tags"
>;

export function listProjectGroups(): string[] {
  return collectGroupPaths(projectsStore.list);
}

function nextSortOrderInGroup(groupKey: string): number {
  const items = projectsStore.list.filter(
    (p) => projectGroupKey(p.group) === groupKey,
  );
  if (items.length === 0) return 0;
  return Math.max(...items.map((p) => p.sortOrder)) + 1;
}

export async function createProject(data: ProjectFormData) {
  const group = normalizeGroupPath(data.group);
  const groupKey = projectGroupKey(group);
  const p: Project = {
    id: `p_${Date.now()}`,
    ...data,
    gitUrl: data.gitUrl?.trim() ?? "",
    group,
    sortOrder: nextSortOrderInGroup(groupKey),
    favorite: false,
    updatedAt: Date.now(),
    links: [],
    commands: [],
    docs: [],
  };
  projectsStore.list.unshift(p);
  syncGroupOrderKeys();
  const db = await getDb();
  if (db) {
    await insertRow(db, p);
    await persistGroupOrder(db);
  }
}

export async function updateProject(id: string, data: ProjectFormData) {
  const p = getProject(id);
  if (!p) return;
  const prevKey = projectGroupKey(p.group);
  const nextGroup = normalizeGroupPath(data.group);
  const nextKey = projectGroupKey(nextGroup);

  p.name = data.name;
  p.description = data.description;
  p.path = data.path;
  p.gitUrl = data.gitUrl.trim();
  p.group = nextGroup;
  p.tags = [...data.tags];
  p.updatedAt = Date.now();

  if (prevKey !== nextKey) {
    p.sortOrder = nextSortOrderInGroup(nextKey);
    normalizeSortOrdersInMemory();
    syncGroupOrderKeys();
  }

  const db = await getDb();
  if (db) {
    await db.execute(
      "UPDATE projects SET name=$1,description=$2,path=$3,git_url=$4,group_name=$5,sort_order=$6,tags=$7,updated_at=$8 WHERE id=$9",
      [
        p.name,
        p.description,
        p.path,
        p.gitUrl,
        p.group,
        p.sortOrder,
        JSON.stringify(p.tags),
        p.updatedAt,
        id,
      ],
    );
    if (prevKey !== nextKey) {
      await persistProjectSortOrders(
        projectsStore.list.filter(
          (x) =>
            projectGroupKey(x.group) === prevKey ||
            projectGroupKey(x.group) === nextKey,
        ),
        db,
      );
      await persistGroupOrder(db);
    }
  } else throw new Error("database unavailable");
}

export async function deleteProject(id: string) {
  const p = getProject(id);
  if (!p) return;
  const key = projectGroupKey(p.group);
  const idx = projectsStore.list.findIndex((x) => x.id === id);
  if (idx >= 0) projectsStore.list.splice(idx, 1);
  normalizeSortOrdersInMemory();
  syncGroupOrderKeys();
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM projects WHERE id=$1", [id]);
    await persistProjectSortOrders(
      projectsStore.list.filter((x) => projectGroupKey(x.group) === key),
      db,
    );
    await persistGroupOrder(db);
  } else throw new Error("database unavailable");
}

export async function renameProjectGroup(pathKey: string, newSegment: string) {
  const segment = newSegment.trim();
  if (!segment || PATH_SEGMENT_INVALID(segment)) {
    throw new Error("分组名称不能为空，且不能包含 /");
  }
  if (!pathKey) throw new Error("不能重命名未分组");

  const oldPrefix = projectGroupKey(pathKey);
  const parts = parseGroupPath(oldPrefix);
  if (parts.length === 0) throw new Error("不能重命名未分组");
  parts[parts.length - 1] = segment;
  const newPrefix = formatGroupPath(parts);
  if (oldPrefix === newPrefix) return;

  for (const p of projectsStore.list) {
    p.group = remapGroupPrefix(p.group, oldPrefix, newPrefix);
  }

  const nextChildOrder: Record<string, string[]> = {};
  for (const [parent, segs] of Object.entries(projectsStore.childGroupOrder)) {
    const newParent = remapGroupPrefix(parent, oldPrefix, newPrefix);
    nextChildOrder[newParent] = segs.map((seg) => {
      const full = parent ? `${parent}${GROUP_PATH_SEP}${seg}` : seg;
      if (full === oldPrefix) return segment;
      if (full.startsWith(`${oldPrefix}${GROUP_PATH_SEP}`)) {
        const remapped = remapGroupPrefix(full, oldPrefix, newPrefix);
        const remappedParts = parseGroupPath(remapped);
        return remappedParts[remappedParts.length - 1] ?? seg;
      }
      return seg;
    });
  }
  projectsStore.childGroupOrder = nextChildOrder;

  if (parts.length === 1) {
    const rootSeg = parseGroupPath(oldPrefix)[0]!;
    const idx = projectsStore.groupOrder.indexOf(rootSeg);
    if (idx >= 0) projectsStore.groupOrder[idx] = segment;
  }
  syncGroupOrderKeys();

  const db = await getDb();
  if (db) {
    for (const p of projectsStore.list) {
      await db.execute("UPDATE projects SET group_name=$1 WHERE id=$2", [
        p.group,
        p.id,
      ]);
    }
    await persistGroupOrder(db);
  }
}

function PATH_SEGMENT_INVALID(seg: string) {
  return /[/／>]/.test(seg);
}

/** 解散分组：当前层项目移至父级，子层路径上移一层 */
export async function dissolveProjectGroup(pathKey: string) {
  if (!pathKey) return;

  const parent = parentGroupPath(pathKey);
  const prefix = `${pathKey}${GROUP_PATH_SEP}`;

  for (const p of projectsStore.list) {
    const k = projectGroupKey(p.group);
    if (k === pathKey) p.group = parent;
    else if (k.startsWith(prefix)) {
      const rest = k.slice(prefix.length);
      p.group = parent ? `${parent}${GROUP_PATH_SEP}${rest}` : rest;
    }
  }

  normalizeSortOrdersInMemory();
  syncGroupOrderKeys();

  const db = await getDb();
  if (db) {
    await persistProjectSortOrders(projectsStore.list, db);
    await persistGroupOrder(db);
  }
}

export async function reorderSiblingGroupsByKey(
  parentPath: string,
  fromKey: string,
  toKey: string,
) {
  if (!fromKey || !toKey || fromKey === toKey) return;

  const parent = projectGroupKey(parentPath);
  let order =
    parent === ""
      ? [...projectsStore.groupOrder]
      : [...(projectsStore.childGroupOrder[parent] ?? [])];

  order = normalizeSegmentList(order, parent);

  const segFrom =
    parent === "" ? parseGroupPath(fromKey)[0] : lastGroupSegment(fromKey);
  const segTo =
    parent === "" ? parseGroupPath(toKey)[0] : lastGroupSegment(toKey);
  if (!segFrom || !segTo || segFrom === segTo) return;

  const fromIndex = order.indexOf(segFrom);
  const toIndex = order.indexOf(segTo);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  const [item] = order.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  order.splice(insertAt, 0, item);

  if (parent === "") {
    projectsStore.groupOrder = [...order];
  } else {
    projectsStore.childGroupOrder = {
      ...projectsStore.childGroupOrder,
      [parent]: [...order],
    };
  }
  await persistGroupOrder();
}

export async function reorderSiblingGroups(
  parentPath: string,
  fromIndex: number,
  toIndex: number,
) {
  const key = projectGroupKey(parentPath);
  let order =
    key === ""
      ? [...projectsStore.groupOrder]
      : [...(projectsStore.childGroupOrder[key] ?? [])];

  order = normalizeSegmentList(order, parentPath);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length ||
    fromIndex === toIndex
  ) {
    return;
  }
  const [item] = order.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  order.splice(insertAt, 0, item);
  if (key === "") {
    projectsStore.groupOrder = [...order];
  } else {
    projectsStore.childGroupOrder = {
      ...projectsStore.childGroupOrder,
      [key]: [...order],
    };
  }
  await persistGroupOrder();
}

/** @deprecated 仅顶层兼容，请用 reorderSiblingGroups */
export async function reorderProjectGroups(fromIndex: number, toIndex: number) {
  return reorderSiblingGroups("", fromIndex, toIndex);
}

export async function moveProjectInGroup(
  projectId: string,
  toGroupKey: string,
  toIndex: number,
) {
  const p = getProject(projectId);
  if (!p) return;

  const fromKey = projectGroupKey(p.group);
  const targetKey = projectGroupKey(toGroupKey);

  const fromItems = projectsStore.list
    .filter((x) => projectGroupKey(x.group) === fromKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt);
  const fromIndex = fromItems.findIndex((x) => x.id === projectId);

  let targetIndex = Math.max(0, toIndex);
  if (fromKey === targetKey && fromIndex >= 0 && fromIndex < targetIndex) {
    targetIndex -= 1;
  }
  if (fromKey === targetKey && fromIndex === targetIndex) return;

  p.group = targetKey;
  p.updatedAt = Date.now();

  const affectedKeys = new Set([fromKey, targetKey]);
  const reindex = (key: string) => {
    const items = projectsStore.list
      .filter((x) => projectGroupKey(x.group) === key)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt,
      );
    if (key === targetKey) {
      const without = items.filter((x) => x.id !== projectId);
      const clamped = Math.max(0, Math.min(targetIndex, without.length));
      without.splice(clamped, 0, p);
      without.forEach((x, i) => {
        x.sortOrder = i;
      });
      return;
    }
    items.forEach((x, i) => {
      x.sortOrder = i;
    });
  };

  reindex(fromKey);
  if (fromKey !== targetKey) reindex(targetKey);
  syncGroupOrderKeys();

  const db = await getDb();
  if (db) {
    await persistProjectSortOrders(
      projectsStore.list.filter((x) =>
        affectedKeys.has(projectGroupKey(x.group)),
      ),
      db,
    );
    await persistGroupOrder(db);
  }
}

export type LinkForm = { title: string; url: string };
export type CommandForm = { title: string; command: string };
export type DocForm = { title: string; path: string };

async function persistSubitems(projectId: string) {
  const p = getProject(projectId);
  if (!p) return;
  p.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      "UPDATE projects SET links=$1, commands=$2, docs=$3, updated_at=$4 WHERE id=$5",
      [
        JSON.stringify(p.links),
        JSON.stringify(p.commands),
        JSON.stringify(p.docs),
        p.updatedAt,
        projectId,
      ],
    );
}

export async function addProjectLink(projectId: string, data: LinkForm) {
  const p = getProject(projectId);
  if (!p) return;
  p.links.push({ id: `l_${Date.now()}`, ...data });
  await persistSubitems(projectId);
}

export async function updateProjectLink(
  projectId: string,
  linkId: string,
  data: LinkForm,
) {
  const p = getProject(projectId);
  if (!p) return;
  const link = p.links.find((l) => l.id === linkId);
  if (!link) return;
  link.title = data.title;
  link.url = data.url;
  await persistSubitems(projectId);
}

export async function deleteProjectLink(projectId: string, linkId: string) {
  const p = getProject(projectId);
  if (!p) return;
  const idx = p.links.findIndex((l) => l.id === linkId);
  if (idx < 0) return;
  p.links.splice(idx, 1);
  await persistSubitems(projectId);
}

export async function addProjectCommand(projectId: string, data: CommandForm) {
  const p = getProject(projectId);
  if (!p) return;
  p.commands.push({ id: `c_${Date.now()}`, ...data });
  await persistSubitems(projectId);
}

export async function updateProjectCommand(
  projectId: string,
  commandId: string,
  data: CommandForm,
) {
  const p = getProject(projectId);
  if (!p) return;
  const cmd = p.commands.find((c) => c.id === commandId);
  if (!cmd) return;
  cmd.title = data.title;
  cmd.command = data.command;
  await persistSubitems(projectId);
}

export async function deleteProjectCommand(
  projectId: string,
  commandId: string,
) {
  const p = getProject(projectId);
  if (!p) return;
  const idx = p.commands.findIndex((c) => c.id === commandId);
  if (idx < 0) return;
  p.commands.splice(idx, 1);
  await persistSubitems(projectId);
}

export async function addProjectDoc(projectId: string, data: DocForm) {
  const p = getProject(projectId);
  if (!p) return;
  p.docs.push({ id: `d_${Date.now()}`, ...data });
  await persistSubitems(projectId);
}

export async function deleteProjectDoc(projectId: string, docId: string) {
  const p = getProject(projectId);
  if (!p) return;
  const idx = p.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return;
  p.docs.splice(idx, 1);
  await persistSubitems(projectId);
}
