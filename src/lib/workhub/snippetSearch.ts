import { snippetCategoryLabel } from "./labels";
import { colorMatchesSearch } from "./colorUtils";
import { symbolMatchesSearch } from "./symbolUtils";

export interface SnippetSearchOptions {
  /** 是否匹配代码正文（首页/悬浮窗关闭；片段列表页开启） */
  includeCode?: boolean;
}

/** 片段搜索（含颜色、符号等特殊分类） */
export function snippetMatchesSearch(
  snippet: { title: string; category: string; code: string; tags: string[] },
  match: (s: string) => boolean,
  kw: string,
  options: SnippetSearchOptions = {},
): boolean {
  const { includeCode = false } = options;
  const categoryLabel = snippetCategoryLabel(snippet.category);
  if (
    match(snippet.title) ||
    match(snippet.category) ||
    match(categoryLabel) ||
    snippet.tags.some(match)
  ) {
    return true;
  }
  if (includeCode && match(snippet.code)) {
    return true;
  }
  if (colorMatchesSearch(snippet, match, kw)) return true;
  return symbolMatchesSearch(snippet, match, kw);
}
