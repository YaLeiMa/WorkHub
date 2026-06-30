import { t } from "@/i18n";
import { parseGroupPath, projectGroupLabel } from "./projectGroups";

/** 按空白、斜杠拆分搜索词 */
function splitSearchTerms(query: string): string[] {
  return query
    .split(/[\s/／>]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 子序列匹配：query 各字符按顺序出现在 text 中（可跨分组段，如「腾方龙门」↔「腾方医信/惠州龙门」） */
function subsequenceMatch(text: string, query: string): boolean {
  let i = 0;
  for (const ch of query) {
    const idx = text.indexOf(ch, i);
    if (idx === -1) return false;
    i = idx + 1;
  }
  return true;
}

/** 单字段模糊匹配：连续子串 → 多词 AND → 子序列 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const h = haystack.toLowerCase();
  if (h.includes(q)) return true;

  const terms = splitSearchTerms(q);
  if (terms.length > 1) {
    return terms.every((t) => matchesSearch(h, t));
  }

  return q.length >= 2 && subsequenceMatch(h, q);
}

/** 项目可搜索文本（名称、描述、路径、分组路径与各层级、标签、未分组展示名） */
export function projectSearchText(project: {
  name: string;
  description: string;
  path: string;
  group: string;
  gitUrl?: string;
  tags: string[];
}): string {
  const segments = parseGroupPath(project.group);
  const pathNorm = project.path.replace(/\\/g, "/");
  return [
    project.name,
    project.description,
    project.path,
    pathNorm,
    project.group,
    projectGroupLabel(project.group),
    project.gitUrl ?? "",
    ...segments,
    segments.join(""),
    ...project.tags,
  ]
    .join(" ")
    .toLowerCase();
}

export function projectMatchesSearch(
  project: {
    name: string;
    description: string;
    path: string;
    group: string;
    gitUrl?: string;
    tags: string[];
  },
  query: string,
): boolean {
  return matchesSearch(projectSearchText(project), query);
}

/** 标题匹配档位：完全 > 前缀 > 包含 */
export function titleMatchScore(title: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = title.toLowerCase();
  if (t === q) return 5000;
  if (t.startsWith(q)) return 4000;
  if (t.includes(q)) return 3000;
  if (matchesSearch(t, q)) return 800;
  return 0;
}

function tagMatchScore(tags: string[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (tags.some((t) => t.toLowerCase() === q)) return 2500;
  if (tags.some((t) => t.toLowerCase().includes(q))) return 2000;
  if (tags.some((t) => matchesSearch(t, q))) return 600;
  return 0;
}

function textMatchScore(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q || !text) return 0;
  const h = text.toLowerCase();
  if (h.includes(q)) return 1000;
  if (matchesSearch(h, q)) return 400;
  return 0;
}

export interface SearchSortableRow {
  title: string;
  subtitle?: string;
  tags?: string[];
  updatedAt: number;
  favorite?: boolean;
  recentAt?: number;
  /** 用于排序分层（如剪贴板全局搜索降权） */
  kind?: string;
}

export interface SortSearchRowsOptions {
  /** 全局搜索时将剪贴板命中排在所有其他类型之后 */
  clipboardLast?: boolean;
}

/** 计算搜索排序分（越高越靠前） */
export function computeSearchScore(
  row: SearchSortableRow,
  query: string,
): number {
  const titleScore = titleMatchScore(row.title, query);
  const tagScore = tagMatchScore(row.tags ?? [], query);
  const subtitleScore = textMatchScore(row.subtitle ?? "", query);

  let score = Math.max(titleScore, tagScore);
  if (titleScore > 0 || tagScore > 0) {
    score = Math.max(score, subtitleScore);
  } else if (subtitleScore > 0) {
    // 仅路径/URL 等副标题命中时降权，避免压过标题前缀匹配（如 cha → chatgpt）
    score = Math.max(score, Math.floor(subtitleScore * 0.35));
  }
  if (row.favorite) score += 50;
  if (row.recentAt) score += row.recentAt / 1e15;
  return score;
}

export function sortSearchRows<T extends SearchSortableRow>(
  rows: T[],
  query: string,
  options?: SortSearchRowsOptions,
): T[] {
  const clipboardLast = options?.clipboardLast ?? false;
  return [...rows].sort((a, b) => {
    if (clipboardLast) {
      const aClip = a.kind === "clipboard";
      const bClip = b.kind === "clipboard";
      if (aClip !== bClip) return aClip ? 1 : -1;
    }
    const diff = computeSearchScore(b, query) - computeSearchScore(a, query);
    if (diff !== 0) return diff;
    return b.updatedAt - a.updatedAt;
  });
}

/** 相对时间 */
export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return t("time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("time.daysAgo", { n: d });
  const mo = Math.floor(d / 30);
  if (mo < 12) return t("time.monthsAgo", { n: mo });
  return t("time.yearsAgo", { n: Math.floor(mo / 12) });
}
