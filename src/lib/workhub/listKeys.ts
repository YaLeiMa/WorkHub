/** 列表页搜索框：↑↓/Enter 等快捷键需穿透；Delete 在无可删字符时交给列表 */
export function shouldBlockListDelete(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;

  if (!el.closest("[data-wh-list-search]")) return true;

  const input = el as HTMLInputElement;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  if (start !== end) return true;
  if (start < input.value.length) return true;
  return false;
}

/** Ctrl+C / Cmd+C 复制当前列表项 */
export function isListCopyChord(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  return mod && e.key.toLowerCase() === "c" && !e.shiftKey && !e.altKey;
}

/** 搜索框内有选中文字时保留系统复制 */
export function shouldBlockListCopy(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  if (!el.closest("[data-wh-list-search]")) return true;
  const input = el as HTMLInputElement;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  return start !== end;
}

export function triggerListCopy(
  e: KeyboardEvent,
  copy: (() => void | boolean | Promise<void>) | undefined,
): boolean {
  if (!isListCopyChord(e) || shouldBlockListCopy(e.target) || !copy) return false;
  e.preventDefault();
  e.stopPropagation();
  void copy();
  return true;
}
