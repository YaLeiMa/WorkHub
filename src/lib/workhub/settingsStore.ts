import { reactive } from "vue";
import {
  LOCALE_STORAGE_KEY,
  setAppLocale,
  type AppLocale,
} from "@/i18n";
import { getDb, inTauri } from "./db";
import { getMeta, setMeta } from "./meta";
import {
  applyStartupWindow,
  reloadGlobalShortcuts,
  syncDefaultWindowMode,
} from "./windowActions";
import {
  startClipboardWatcher,
  stopClipboardWatcher,
} from "./clipboardWatcher";
import { applyClipboardHistoryMax } from "./clipboardStore";

const KEY_ALWAYS_ON_TOP = "setting_always_on_top";
const KEY_AUTO_START = "setting_auto_start";
const KEY_DEFAULT_WINDOW = "setting_default_window";
const KEY_SPOTLIGHT_HOTKEY = "setting_hotkey_spotlight";
const KEY_MAIN_HOTKEY = "setting_hotkey_main";
const KEY_CLIPBOARD_HISTORY = "setting_clipboard_history";
const KEY_CLIPBOARD_MAX = "setting_clipboard_max";
const KEY_LOCALE = LOCALE_STORAGE_KEY;

export type DefaultWindow = "spotlight" | "main" | "hidden";

export const settingsStore = reactive({
  locale: "zh-CN" as AppLocale,
  alwaysOnTop: false,
  autoStart: false,
  defaultWindow: "spotlight" as DefaultWindow,
  spotlightHotkey: "Alt+X",
  mainHotkey: "Alt+Z",
  clipboardHistoryEnabled: true,
  clipboardHistoryMax: 100,
  loaded: false,
});

let loading: Promise<void> | null = null;

async function applyAlwaysOnTop() {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("window_set_always_on_top", {
    alwaysOnTop: settingsStore.alwaysOnTop,
  });
}

export async function loadSettings() {
  if (settingsStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    if (inTauri()) {
      const db = await getDb();
      if (db) {
        const top = await getMeta(db, KEY_ALWAYS_ON_TOP);
        settingsStore.alwaysOnTop = top === "1";
        const start = await getMeta(db, KEY_AUTO_START);
        settingsStore.autoStart = start === "1";
        const def = await getMeta(db, KEY_DEFAULT_WINDOW);
        if (def === "main" || def === "hidden" || def === "spotlight") {
          settingsStore.defaultWindow = def;
        }
        const sh = await getMeta(db, KEY_SPOTLIGHT_HOTKEY);
        const mh = await getMeta(db, KEY_MAIN_HOTKEY);
        // 迁移旧版默认快捷键（Alt+Z 悬浮 / Alt+X 主窗口 → 已对调）
        if (sh === "Alt+Z" && mh === "Alt+X") {
          settingsStore.spotlightHotkey = "Alt+X";
          settingsStore.mainHotkey = "Alt+Z";
          await setMeta(db, KEY_SPOTLIGHT_HOTKEY, "Alt+X");
          await setMeta(db, KEY_MAIN_HOTKEY, "Alt+Z");
        } else {
          if (sh) settingsStore.spotlightHotkey = sh;
          if (mh) settingsStore.mainHotkey = mh;
        }
        const cb = await getMeta(db, KEY_CLIPBOARD_HISTORY);
        if (cb === "0") settingsStore.clipboardHistoryEnabled = false;
        const cbMax = await getMeta(db, KEY_CLIPBOARD_MAX);
        if (cbMax) {
          const n = Number(cbMax);
          if (n >= 20 && n <= 500) settingsStore.clipboardHistoryMax = n;
        }
        const loc = await getMeta(db, KEY_LOCALE);
        if (loc === "en" || loc === "zh-CN") {
          settingsStore.locale = loc;
          setAppLocale(loc);
        }
      }
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        settingsStore.autoStart = await isEnabled();
      } catch {
        /* 插件不可用时保留 meta 值 */
      }
    } else {
      settingsStore.alwaysOnTop =
        localStorage.getItem(KEY_ALWAYS_ON_TOP) === "1";
      settingsStore.autoStart = localStorage.getItem(KEY_AUTO_START) === "1";
      const def = localStorage.getItem(KEY_DEFAULT_WINDOW);
      if (def === "main" || def === "hidden" || def === "spotlight") {
        settingsStore.defaultWindow = def;
      }
      settingsStore.spotlightHotkey =
        localStorage.getItem(KEY_SPOTLIGHT_HOTKEY) ?? "Alt+X";
      settingsStore.mainHotkey =
        localStorage.getItem(KEY_MAIN_HOTKEY) ?? "Alt+Z";
      settingsStore.clipboardHistoryEnabled =
        localStorage.getItem(KEY_CLIPBOARD_HISTORY) !== "0";
      const cbMax = localStorage.getItem(KEY_CLIPBOARD_MAX);
      if (cbMax) {
        const n = Number(cbMax);
        if (n >= 20 && n <= 500) settingsStore.clipboardHistoryMax = n;
      }
      const loc = localStorage.getItem(KEY_LOCALE);
      if (loc === "en" || loc === "zh-CN") {
        settingsStore.locale = loc;
        setAppLocale(loc);
      }
    }
    settingsStore.loaded = true;
    if (inTauri() && settingsStore.clipboardHistoryEnabled) {
      startClipboardWatcher();
    }
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

/** 主窗口启动时应用桌面偏好（置顶、快捷键、默认显示窗口） */
export async function applyDesktopPreferences() {
  if (!inTauri()) return;
  await applyAlwaysOnTop();
  await reloadGlobalShortcuts(
    settingsStore.spotlightHotkey,
    settingsStore.mainHotkey,
  );
  await applyStartupWindow(settingsStore.defaultWindow);
}

export async function setAlwaysOnTop(enabled: boolean) {
  settingsStore.alwaysOnTop = enabled;
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_ALWAYS_ON_TOP, enabled ? "1" : "0");
    await applyAlwaysOnTop();
  } else {
    localStorage.setItem(KEY_ALWAYS_ON_TOP, enabled ? "1" : "0");
  }
}

export async function setAutoStart(enabled: boolean) {
  if (inTauri()) {
    const { disable, enable } = await import("@tauri-apps/plugin-autostart");
    if (enabled) await enable();
    else await disable();
    const db = await getDb();
    if (db) await setMeta(db, KEY_AUTO_START, enabled ? "1" : "0");
  } else {
    localStorage.setItem(KEY_AUTO_START, enabled ? "1" : "0");
  }
  settingsStore.autoStart = enabled;
}

export async function setDefaultWindow(mode: DefaultWindow) {
  settingsStore.defaultWindow = mode;
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_DEFAULT_WINDOW, mode);
    await syncDefaultWindowMode(mode);
  } else {
    localStorage.setItem(KEY_DEFAULT_WINDOW, mode);
  }
}

export async function setSpotlightHotkey(hotkey: string) {
  settingsStore.spotlightHotkey = hotkey.trim() || "Alt+X";
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_SPOTLIGHT_HOTKEY, settingsStore.spotlightHotkey);
    await reloadGlobalShortcuts(
      settingsStore.spotlightHotkey,
      settingsStore.mainHotkey,
    );
  } else {
    localStorage.setItem(KEY_SPOTLIGHT_HOTKEY, settingsStore.spotlightHotkey);
  }
}

export async function setMainHotkey(hotkey: string) {
  settingsStore.mainHotkey = hotkey.trim() || "Alt+Z";
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_MAIN_HOTKEY, settingsStore.mainHotkey);
    await reloadGlobalShortcuts(
      settingsStore.spotlightHotkey,
      settingsStore.mainHotkey,
    );
  } else {
    localStorage.setItem(KEY_MAIN_HOTKEY, settingsStore.mainHotkey);
  }
}

export async function setClipboardHistoryEnabled(enabled: boolean) {
  settingsStore.clipboardHistoryEnabled = enabled;
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_CLIPBOARD_HISTORY, enabled ? "1" : "0");
    if (enabled) startClipboardWatcher();
    else stopClipboardWatcher();
  } else {
    localStorage.setItem(KEY_CLIPBOARD_HISTORY, enabled ? "1" : "0");
  }
}

export async function setLocale(locale: AppLocale) {
  settingsStore.locale = locale;
  setAppLocale(locale);
  const { broadcastLocaleChange } = await import("@/i18n");
  await broadcastLocaleChange(locale);
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_LOCALE, locale);
  } else {
    localStorage.setItem(KEY_LOCALE, locale);
  }
}

export async function setClipboardHistoryMax(max: number) {
  const clamped = Math.min(500, Math.max(20, max));
  settingsStore.clipboardHistoryMax = clamped;
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, KEY_CLIPBOARD_MAX, String(clamped));
    await applyClipboardHistoryMax(clamped);
  } else {
    localStorage.setItem(KEY_CLIPBOARD_MAX, String(clamped));
  }
}
