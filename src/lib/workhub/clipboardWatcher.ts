import { inTauri } from "./db";
import { recordClipboard } from "./clipboardStore";
import { settingsStore } from "./settingsStore";

let lastRead = "";
let skipNext = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** 应用自身写入剪贴板时调用，避免记入历史 */
export function markClipboardSelfWrite(text: string) {
  skipNext = true;
  lastRead = text;
}

export function startClipboardWatcher() {
  if (!inTauri() || timer) return;

  timer = setInterval(() => {
    void pollClipboard();
  }, 700);
}

export function stopClipboardWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function pollClipboard() {
  if (!settingsStore.clipboardHistoryEnabled) return;
  try {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    const text = await readText();
    if (text == null || text === "") return;

    if (skipNext) {
      skipNext = false;
      lastRead = text;
      return;
    }
    if (text === lastRead) return;

    lastRead = text;
    await recordClipboard(text);
  } catch {
    /* 剪贴板无文本或不可读 */
  }
}
