import { t } from "@/i18n";
import type { Project } from "./types";

export const MAX_GROUP_DEPTH = 3;
export const GROUP_PATH_SEP = "/";
export const PROJECT_UNGROUPED_KEY = "";
/** DOM 上表示顶层父路径，避免 data 空字符串丢失 */
export const ROOT_GROUP_PARENT = "__root__";

export function encodeGroupParent(parentPath: string): string {
  return parentPath || ROOT_GROUP_PARENT;
}

export function decodeGroupParent(raw: string): string {
  return raw === ROOT_GROUP_PARENT ? "" : raw;
}

const PATH_SPLIT = /[/／>]/;

export function parseGroupPath(group: string): string[] {
  return group
    .split(PATH_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_GROUP_DEPTH);
}

export function formatGroupPath(segments: string[]): string {
  return segments
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_GROUP_DEPTH)
    .join(GROUP_PATH_SEP);
}

export function normalizeGroupPath(group: string): string {
  return formatGroupPath(parseGroupPath(group));
}

export function projectGroupKey(group: string): string {
  return normalizeGroupPath(group);
}

export function projectGroupLabel(group: string): string {
  const key = projectGroupKey(group);
  return key || t("project.ungrouped");
}

export function parentGroupPath(pathKey: string): string {
  const parts = parseGroupPath(pathKey);
  if (parts.length <= 1) return "";
  return formatGroupPath(parts.slice(0, -1));
}

export function lastGroupSegment(pathKey: string): string {
  const parts = parseGroupPath(pathKey);
  return parts[parts.length - 1] ?? "";
}

export function validateGroupPath(group: string): string | null {
  const trimmed = group.trim();
  if (!trimmed) return null;
  if (trimmed.includes(GROUP_PATH_SEP) && /[/／>]{2,}/.test(trimmed)) {
    return "分组路径格式不正确";
  }
  const parts = parseGroupPath(trimmed);
  if (parts.length === 0) return "分组名称不能为空";
  if (parts.some((s) => !s)) return "分组名称不能为空";
  if (parts.length > MAX_GROUP_DEPTH) {
    return `分组最多 ${MAX_GROUP_DEPTH} 层（父/子/孙）`;
  }
  if (parts.some((s) => s.includes(GROUP_PATH_SEP))) {
    return "单层分组名不能包含 /";
  }
  return null;
}

export type ProjectGroupNode = {
  /** 完整路径，空字符串表示未分组 */
  key: string;
  segment: string;
  depth: number;
  projects: Project[];
  children: ProjectGroupNode[];
};

function sortProjects(items: Project[]) {
  items.sort(
    (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt,
  );
}

function compareSegments(a: string, b: string) {
  return a.localeCompare(b, "zh");
}

function orderChildSegments(
  parentPath: string,
  segments: string[],
  rootOrder: string[],
  childOrder: Record<string, string[]>,
): string[] {
  const parentKey = parentPath;
  const saved = childOrder[parentKey] ?? [];
  const ordered: string[] = [];
  for (const seg of saved) {
    if (segments.includes(seg) && !ordered.includes(seg)) ordered.push(seg);
  }
  if (!parentPath) {
    for (const seg of rootOrder) {
      if (segments.includes(seg) && !ordered.includes(seg)) ordered.push(seg);
    }
  }
  for (const seg of [...segments].sort(compareSegments)) {
    if (!ordered.includes(seg)) ordered.push(seg);
  }
  return ordered;
}

export function buildProjectGroupTree(
  projects: Project[],
  rootOrder: string[],
  childOrder: Record<string, string[]>,
): ProjectGroupNode[] {
  type InternalNode = ProjectGroupNode & { childMap: Map<string, InternalNode> };

  const roots = new Map<string, InternalNode>();
  const nodeByKey = new Map<string, InternalNode>();

  function getOrCreate(pathParts: string[]): InternalNode {
    let key = "";
    for (let i = 0; i < pathParts.length; i++) {
      const segment = pathParts[i]!;
      const parentKey = key;
      key = key ? `${key}${GROUP_PATH_SEP}${segment}` : segment;

      let node = nodeByKey.get(key);
      if (!node) {
        node = {
          key,
          segment,
          depth: i,
          projects: [],
          children: [],
          childMap: new Map(),
        };
        nodeByKey.set(key, node);
        if (parentKey) {
          const parent = nodeByKey.get(parentKey)!;
          parent.childMap.set(segment, node);
        } else {
          roots.set(segment, node);
        }
      }
    }
    return nodeByKey.get(key)!;
  }

  const ungrouped: InternalNode = {
    key: "",
    segment: "",
    depth: 0,
    projects: [],
    children: [],
    childMap: new Map(),
  };

  for (const project of projects) {
    const parts = parseGroupPath(project.group);
    if (parts.length === 0) {
      ungrouped.projects.push(project);
      continue;
    }
    getOrCreate(parts).projects.push(project);
  }

  function finalize(node: InternalNode): ProjectGroupNode {
    sortProjects(node.projects);
    const segments = orderChildSegments(
      node.key,
      [...node.childMap.keys()],
      rootOrder,
      childOrder,
    );
    node.children = segments
      .map((seg) => node.childMap.get(seg)!)
      .filter(Boolean)
      .map((child) => finalize(child));
    const { childMap: _c, ...rest } = node;
    return rest;
  }

  const topSegments = orderChildSegments(
    "",
    [...roots.keys()],
    rootOrder,
    childOrder,
  );
  const tree = topSegments.map((seg) => finalize(roots.get(seg)!));

  if (ungrouped.projects.length > 0) {
    sortProjects(ungrouped.projects);
    const { childMap: _c, ...rest } = ungrouped;
    tree.push(rest);
  }

  return tree;
}

export function collectGroupPaths(projects: Project[]): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    const parts = parseGroupPath(p.group);
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}${GROUP_PATH_SEP}${part}` : part;
      set.add(acc);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
}

export function flattenGroupTree(
  nodes: ProjectGroupNode[],
  collapsedKeys?: ReadonlySet<string>,
): { node: ProjectGroupNode; flatIndex: number; project: Project }[] {
  const rows: { node: ProjectGroupNode; flatIndex: number; project: Project }[] =
    [];
  let idx = 0;

  function walk(node: ProjectGroupNode) {
    if (collapsedKeys?.has(node.key)) return;
    for (const project of node.projects) {
      rows.push({ node, flatIndex: idx++, project });
    }
    for (const child of node.children) walk(child);
  }

  for (const node of nodes) walk(node);
  return rows;
}

export function collectGroupNodeKeys(nodes: ProjectGroupNode[]): string[] {
  const keys: string[] = [];
  function walk(node: ProjectGroupNode) {
    if (node.projects.length > 0 || node.children.length > 0) keys.push(node.key);
    for (const child of node.children) walk(child);
  }
  for (const node of nodes) walk(node);
  return keys;
}

export function countProjectsInNode(node: ProjectGroupNode): number {
  let n = node.projects.length;
  for (const child of node.children) n += countProjectsInNode(child);
  return n;
}

export function remapGroupPath(
  oldPath: string,
  mutate: (parts: string[]) => string[],
): string {
  const parts = parseGroupPath(oldPath);
  if (parts.length === 0) return "";
  return formatGroupPath(mutate(parts));
}
