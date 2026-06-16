import { t } from "@/i18n";
import { isColorSnippet, normalizeHex, snippetSwatchHex } from "./colorUtils";
import {
  isSymbolSnippet,
  normalizeSymbol,
  snippetSymbolGlyph,
} from "./symbolUtils";
import type { Snippet } from "./types";

/** 列表/搜索副标题 */
export function snippetSubtitle(snippet: Snippet): string {
  return (
    snippetSwatchHex(snippet) ??
    snippetSymbolGlyph(snippet) ??
    snippet.code.split("\n")[0] ??
    ""
  );
}

export function snippetListSwatch(snippet: Snippet): string | undefined {
  return snippetSwatchHex(snippet);
}

export function snippetListGlyph(snippet: Snippet): string | undefined {
  return snippetSymbolGlyph(snippet);
}

export function snippetCopyText(snippet: Snippet): string {
  if (isColorSnippet(snippet.category)) {
    return normalizeHex(snippet.code) ?? snippet.code.trim();
  }
  if (isSymbolSnippet(snippet.category)) {
    return normalizeSymbol(snippet.code) ?? snippet.code.trim();
  }
  return snippet.code;
}

export function snippetCopyToast(snippet: Snippet): string {
  if (isColorSnippet(snippet.category)) return t("toast.colorCopied");
  if (isSymbolSnippet(snippet.category)) return t("toast.symbolCopied");
  return t("toast.codeCopied");
}
