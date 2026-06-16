import { inTauri } from "./db";

export type WindowLabel = "main" | "spotlight";

let currentLabel: WindowLabel = "main";

export function setWindowLabel(label: WindowLabel) {
  currentLabel = label;
}

export function getWindowLabel(): WindowLabel {
  return currentLabel;
}

export function isSpotlightWindow() {
  return currentLabel === "spotlight";
}

export async function hideCurrentWindow() {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  if (isSpotlightWindow()) await invoke("window_hide_spotlight");
  else await invoke("window_hide");
}

export async function hideSpotlightWindow() {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("window_hide_spotlight");
}

export async function showMainWindow(options?: {
  path?: string;
  focusSearch?: boolean;
}) {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("window_show_main", {
    path: options?.path ?? null,
    focusSearch: options?.focusSearch ?? false,
  });
}

export async function showSpotlightWindow() {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("window_show_spotlight");
}

export async function syncDefaultWindowMode(
  mode: "spotlight" | "main" | "hidden",
) {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("sync_default_window_mode", { mode });
}

export async function applyStartupWindow(
  mode: "spotlight" | "main" | "hidden",
) {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("apply_startup_window", { mode });
}

export async function reloadGlobalShortcuts(spotlight: string, main: string) {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("shortcut_reload", { spotlight, main });
}
