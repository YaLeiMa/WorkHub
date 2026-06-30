import type { SearchGroupKey } from "./labels";

/** 搜索框前缀 → 只搜该分组 */
export const SEARCH_PREFIX_MAP: Record<string, SearchGroupKey> = {
  "@": "project",
  "#": "snippet",
  ">": "command",
  $: "link",
  "/": "file",
  "%": "clipboard",
  "!": "app",
  "=": "tool",
};

export interface ParsedSearchQuery {
  /** 限定分组；无前缀时为 null（全局） */
  scope: SearchGroupKey | null;
  /** 前缀字符 @ # > $ / % ! */
  prefix: string | null;
  /** 去掉前缀后的关键词（已 trim + lowerCase） */
  query: string;
  /** 原始输入是否非空（含仅前缀） */
  hasInput: boolean;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { scope: null, prefix: null, query: "", hasInput: false };
  }
  const prefixChar = trimmed[0];
  const scope = SEARCH_PREFIX_MAP[prefixChar] ?? null;
  if (!scope) {
    return {
      scope: null,
      prefix: null,
      query: trimmed.toLowerCase(),
      hasInput: true,
    };
  }
  const query = trimmed.slice(1).trim().toLowerCase();
  return { scope, prefix: prefixChar, query, hasInput: true };
}

export function searchPrefixHint(scope: SearchGroupKey): string {
  const char =
    Object.entries(SEARCH_PREFIX_MAP).find(([, g]) => g === scope)?.[0] ?? "";
  return char;
}
