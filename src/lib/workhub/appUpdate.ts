import { reactive } from "vue";
import { t } from "@/i18n";
import { inTauri } from "./db";
import { toast } from "./toast";

export const APP_RELEASES_URL =
  "https://gitcode.com/weixin_48914151/work_hub_releases/";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "error";

export const appUpdateStore = reactive({
  status: "idle" as AppUpdateStatus,
  availableVersion: "",
  checkedAt: 0,
});

let refreshPromise: Promise<void> | null = null;

function applyUpdateCheckResult(available: boolean, version = "") {
  appUpdateStore.status = available ? "available" : "latest";
  appUpdateStore.availableVersion = available ? version : "";
  appUpdateStore.checkedAt = Date.now();
}

/** 静默检查更新，供设置页与启动时展示是否有新版本 */
export function refreshAppUpdateStatus(): Promise<void> {
  if (!inTauri()) {
    appUpdateStore.status = "idle";
    appUpdateStore.availableVersion = "";
    return Promise.resolve();
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    appUpdateStore.status = "checking";
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      applyUpdateCheckResult(Boolean(update?.available), update?.version ?? "");
    } catch {
      appUpdateStore.status = "error";
      appUpdateStore.availableVersion = "";
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getAppVersion(): Promise<string> {  if (!inTauri()) return "browser";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** 检查更新；interactive 为 true 时提示「已是最新」或确认安装 */
export async function checkForAppUpdate(interactive: boolean): Promise<void> {
  if (!inTauri()) {
    if (interactive) toast.error(t("settings.updateDesktopOnly"));
    return;
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) {
      applyUpdateCheckResult(false);
      if (interactive) toast.success(t("settings.toastUpdateLatest"));
      return;
    }

    applyUpdateCheckResult(true, update.version);

    if (interactive) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const notes = update.body?.trim() || t("settings.updateNoNotes");
      const yes = await ask(
        t("settings.updateConfirmBody", { version: update.version, notes }),
        {
          title: t("settings.updateConfirmTitle", { version: update.version }),
          kind: "info",
          okLabel: t("settings.updateInstall"),
          cancelLabel: t("common.cancel"),
        },
      );
      if (!yes) return;
    }

    if (interactive) toast.success(t("settings.toastUpdateDownloading"));

    await update.downloadAndInstall((event) => {
      if (event.event === "Finished" && interactive) {
        toast.success(t("settings.toastUpdateDownloaded"));
      }
    });

    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    if (interactive) {
      toast.error(
        e instanceof Error ? e.message : t("settings.toastUpdateFailed"),
      );
    }
    throw e;
  }
}
