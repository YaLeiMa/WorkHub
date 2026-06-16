import { t } from "@/i18n";
import type { ItemKind, SnippetCategory } from "./types";

/** 搜索分组键（内部逻辑用，展示请用 searchGroupLabel） */
export type SearchGroupKey =
  | "project"
  | "snippet"
  | "favorite"
  | "file"
  | "link"
  | "command"
  | "clipboard";

export const SEARCH_GROUP_SNIPPETS: SearchGroupKey = "snippet";
export const SEARCH_GROUP_FAVORITES: SearchGroupKey = "favorite";

export function searchGroupLabel(key: SearchGroupKey): string {
  return t(`searchGroup.${key}`);
}

export function kindLabel(kind: ItemKind): string {
  return t(`kind.${kind}`);
}

const CATEGORY_I18N: Record<string, string> = {
  全部: "snippet.category.all",
  shell: "snippet.category.shell",
  git: "snippet.category.git",
  sql: "snippet.category.sql",
  代码: "snippet.category.code",
  正则: "snippet.category.regex",
  颜色: "snippet.category.color",
  符号: "snippet.category.symbol",
  其他: "snippet.category.other",
};

/** 片段分类展示名（DB 仍存中文/英文技术名） */
export function snippetCategoryLabel(category: string): string {
  const key = CATEGORY_I18N[category];
  return key ? t(key) : category;
}

export const SNIPPET_FILTER_ALL = "全部" as const;

export const SNIPPET_CATEGORIES: readonly (typeof SNIPPET_FILTER_ALL | SnippetCategory)[] =
  ["全部", "shell", "git", "sql", "代码", "正则", "颜色", "符号", "其他"];

export const SNIPPET_FORM_CATEGORIES: SnippetCategory[] = [
  "shell",
  "git",
  "sql",
  "代码",
  "正则",
  "颜色",
  "符号",
  "其他",
];
