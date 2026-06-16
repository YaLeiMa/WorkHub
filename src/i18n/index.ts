import { createI18n } from "vue-i18n";
import zhCN from "./locales/zh-CN";
import en from "./locales/en";

export type AppLocale = "zh-CN" | "en";

export const LOCALE_STORAGE_KEY = "setting_locale";
export const LOCALE_CHANGED_EVENT = "workhub:locale-changed";

const saved =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(LOCALE_STORAGE_KEY)
    : null;
const initialLocale: AppLocale =
  saved === "en" || saved === "zh-CN" ? saved : "zh-CN";

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    en,
  },
});

export function t(key: string, values?: Record<string, unknown>): string {
  return i18n.global.t(key, values ?? {});
}

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

export function getAppLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale;
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 各 Tauri 窗口间同步语言（主窗口改语言后，悬浮窗即时更新） */
export async function bindLocaleSync(): Promise<() => void> {
  const unsubs: Array<() => void> = [];

  if (inTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    unsubs.push(
      await listen<AppLocale>(LOCALE_CHANGED_EVENT, (e) => {
        if (e.payload === "en" || e.payload === "zh-CN") {
          setAppLocale(e.payload);
        }
      }),
    );
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== LOCALE_STORAGE_KEY) return;
    if (ev.newValue === "en" || ev.newValue === "zh-CN") {
      setAppLocale(ev.newValue);
    }
  };
  window.addEventListener("storage", onStorage);
  unsubs.push(() => window.removeEventListener("storage", onStorage));

  return () => unsubs.forEach((fn) => fn());
}

export async function broadcastLocaleChange(locale: AppLocale) {
  if (inTauri()) {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(LOCALE_CHANGED_EVENT, locale);
  }
}
