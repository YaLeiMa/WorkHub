import { t } from "@/i18n";
import { toast } from "./toast";
import { recordRecent, type RecentInput } from "./recentStore";
import { markClipboardSelfWrite } from "./clipboardWatcher";
// 是否运行在 Tauri 桌面环境（否则为浏览器，走降级逻辑）
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 成功执行主操作后写入最近使用（open / copy） */
export type RecentMeta = Omit<RecentInput, "action">;

export async function copyText(
  text: string,
  successText = t("toast.copied"),
  recent?: RecentMeta,
) {
  try {
    markClipboardSelfWrite(text);
    if (inTauri()) {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast.success(successText);
    if (recent) void recordRecent({ ...recent, action: "copy" });
  } catch {
    toast.error(t("toast.copyFailed"));
  }
}

export async function openUrl(url: string, recent?: RecentMeta) {
  try {
    if (inTauri()) {
      const { openUrl: open } = await import("@tauri-apps/plugin-opener");
      await open(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
    toast.success(t("toast.linkOpened"));
    if (recent) void recordRecent({ ...recent, action: "open" });
  } catch {
    toast.error(t("toast.linkOpenFailed"));
  }
}

// 打开本地文件 / 文件夹（系统默认程序 / 资源管理器）
export async function openPath(
  target: string,
  successText = t("toast.opened"),
  recent?: RecentMeta,
) {
  if (!inTauri()) {
    toast.success(successText);
    if (recent) void recordRecent({ ...recent, action: "open" });
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_local_path", { path: target.trim() });
    toast.success(successText);
    if (recent) void recordRecent({ ...recent, action: "open" });
  } catch (e) {
    toast.error(typeof e === "string" ? e : t("toast.fileMissing"));
  }
}

// 兼容旧调用：打开文件/文档
export function openFile(
  target: string,
  successText = t("toast.opened"),
  recent?: RecentMeta,
) {
  return openPath(target, successText, recent);
}

// 用 VSCode 打开项目（调用 Rust 命令 open_in_vscode）
export async function openProject(
  path: string,
  name?: string,
  recent?: RecentMeta,
) {
  const successText = t("toast.vscodeOpened", { name: name ?? path });
  if (!inTauri()) {
    toast.success(successText);
    if (recent) void recordRecent({ ...recent, action: "open" });
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_in_vscode", { path });
    toast.success(successText);
    if (recent) void recordRecent({ ...recent, action: "open" });
  } catch (e) {
    toast.error(
      typeof e === "string" ? e : t("toast.vscodeMissing"),
    );
  }
}

/** 桌面端打开目录选择器，浏览器环境返回 null */
export async function pickDirectory(): Promise<string | null> {
  if (!inTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      directory: true,
      multiple: false,
      title: t("dialog.pickProjectDir"),
    });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

/** 桌面端打开文件选择器，浏览器环境返回 null */
export async function pickDocument(): Promise<string | null> {
  if (!inTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ multiple: false, title: t("dialog.pickDocument") });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

export { kindLabel } from "./labels";