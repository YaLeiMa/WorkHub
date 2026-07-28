import { getWorkflow, workflowsStore } from "./workflowsStore";
import { requestWorkflowRun } from "./workflowRunPrompt";
import { inTauri } from "./db";
import { settingsStore } from "./settingsStore";

export function normalizeWorkflowHotkey(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/** 校验工作流快捷键是否与系统/其他工作流冲突 */
export function validateWorkflowHotkey(
  hotkey: string,
  workflowId?: string,
): "conflict_app" | "conflict_workflow" | null {
  const norm = normalizeWorkflowHotkey(hotkey);
  if (!norm) return null;

  const lower = norm.toLowerCase();
  const appKeys = [
    settingsStore.spotlightHotkey,
    settingsStore.mainHotkey,
    "Ctrl+Alt+Q",
  ].map((k) => k.replace(/\s+/g, "").toLowerCase());

  if (appKeys.includes(lower)) {
    return "conflict_app";
  }

  const dup = workflowsStore.list.find(
    (w) =>
      w.id !== workflowId &&
      w.hotkey &&
      normalizeWorkflowHotkey(w.hotkey).toLowerCase() === lower,
  );
  if (dup) return "conflict_workflow";

  return null;
}

/** 将当前工作流快捷键同步到 Rust 全局注册 */
export async function syncWorkflowHotkeys() {
  if (!inTauri()) return;
  const bindings = workflowsStore.list
    .filter((w) => w.hotkey?.trim())
    .map((w) => ({
      workflowId: w.id,
      hotkey: normalizeWorkflowHotkey(w.hotkey!),
    }));
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("workflow_shortcuts_reload", { bindings });
  } catch (e) {
    console.warn("workflow hotkeys sync failed", e);
  }
}

/** 监听全局快捷键触发的工作流运行 */
export async function bindWorkflowHotkeyRunner(): Promise<() => void> {
  if (!inTauri()) return () => {};

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("workhub:run-workflow", (e) => {
    const id = e.payload;
    if (!id) return;
    const workflow = getWorkflow(id);
    if (workflow) void requestWorkflowRun(workflow);
  });
  return unlisten;
}
