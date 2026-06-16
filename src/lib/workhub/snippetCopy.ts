import { reactive } from "vue";
import { copyText, type RecentMeta } from "./actions";
import { isColorSnippet } from "./colorUtils";
import { snippetCopyText, snippetCopyToast } from "./snippetDisplay";
import { isSymbolSnippet } from "./symbolUtils";
import {
  applySnippetVariables,
  extractSnippetVariables,
  hasSnippetVariables,
  type SnippetVariable,
} from "./snippetVariables";
import {
  loadInitialVariableValues,
  saveVariableValues,
} from "./snippetVariableMemory";
import type { Snippet } from "./types";
import { hideCurrentWindow, isSpotlightWindow } from "./windowActions";

export const snippetCopyState = reactive<{
  open: boolean;
  snippet: Snippet | null;
  variables: SnippetVariable[];
  values: Record<string, string>;
  recent?: RecentMeta;
}>({
  open: false,
  snippet: null,
  variables: [],
  values: {},
  recent: undefined,
});

function closeSnippetCopyDialog() {
  snippetCopyState.open = false;
  snippetCopyState.snippet = null;
  snippetCopyState.variables = [];
  snippetCopyState.values = {};
  snippetCopyState.recent = undefined;
}

/** 复制片段；含 {{变量}} 时打开填写对话框，返回 true 表示已打开对话框 */
export async function requestSnippetCopy(
  snippet: Snippet,
  recent?: RecentMeta,
): Promise<boolean> {
  const raw = snippetCopyText(snippet);
  if (
    isColorSnippet(snippet.category) ||
    isSymbolSnippet(snippet.category) ||
    !hasSnippetVariables(raw)
  ) {
    void copyText(raw, snippetCopyToast(snippet), recent);
    return false;
  }

  const variables = extractSnippetVariables(raw);
  snippetCopyState.snippet = snippet;
  snippetCopyState.variables = variables;
  snippetCopyState.values = await loadInitialVariableValues(
    snippet.id,
    variables,
  );
  snippetCopyState.recent = recent;
  snippetCopyState.open = true;
  return true;
}

export function cancelSnippetCopy() {
  closeSnippetCopyDialog();
}

export async function confirmSnippetCopy() {
  const { snippet, values, recent } = snippetCopyState;
  if (!snippet) return;

  const raw = snippetCopyText(snippet);
  const text = applySnippetVariables(raw, values);
  await saveVariableValues(snippet.id, values);
  closeSnippetCopyDialog();
  await copyText(text, snippetCopyToast(snippet), recent);
  if (isSpotlightWindow()) void hideCurrentWindow();
}
