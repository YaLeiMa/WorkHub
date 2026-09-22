import { reactive } from "vue";
import { inTauri } from "./db";
import { t } from "@/i18n";

/** 后端 shell_command.rs 的运行中命令（含工作流「后台常驻」启动的服务） */
export interface ShellRunInfo {
  id: string;
  /** 展示用名称：工作流传的是「工作流名 · 步骤标题」，否则是命令的程序名 */
  name?: string | null;
  command: string;
  cwd?: string | null;
  pid: number;
  background: boolean;
  startedAt: number;
  logPath?: string | null;
}

export const shellRunsStore = reactive<{
  list: ShellRunInfo[];
  loading: boolean;
  loaded: boolean;
}>({
  list: [],
  loading: false,
  loaded: false,
});

export async function refreshShellRuns(): Promise<ShellRunInfo[]> {
  if (!inTauri()) return shellRunsStore.list;
  if (shellRunsStore.loading) return shellRunsStore.list;
  shellRunsStore.loading = true;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    shellRunsStore.list = await invoke<ShellRunInfo[]>("shell_run_list");
    shellRunsStore.loaded = true;
  } catch {
    /* ACL 未配置或后端不可用时静默 */
  } finally {
    shellRunsStore.loading = false;
  }
  return shellRunsStore.list;
}

/** 停止一个命令（后端会连同 cmd / node 子进程整棵树一起结束） */
export async function stopShellRun(id: string): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const stopped = await invoke<boolean>("shell_run_stop", { id });
    await refreshShellRuns();
    return stopped;
  } catch (e) {
    console.warn("shell_run_stop failed", e);
    await refreshShellRuns();
    return false;
  }
}

export async function stopAllShellRuns(): Promise<number> {
  if (!inTauri()) return 0;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const count = await invoke<number>("shell_run_stop_all");
    await refreshShellRuns();
    return count;
  } catch (e) {
    console.warn("shell_run_stop_all failed", e);
    await refreshShellRuns();
    return 0;
  }
}

/** 打开某个命令的日志文件（后台常驻命令的输出） */
export async function openShellRunLog(path: string): Promise<void> {
  if (!inTauri() || !path) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_local_path", { path });
  } catch (e) {
    console.warn("open shell log failed", e);
  }
}

/** 列表里显示的名称：优先后端给的 name，缺失时退回命令原文 */
export function shellRunTitle(run: ShellRunInfo): string {
  const name = (run.name ?? "").trim();
  if (name) return name;
  return run.command.trim() || t("workflow.background.untitled");
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 页面挂载时开启轮询：后台命令随时可能自己退出，需要刷新列表 */
export function startShellRunsPolling(intervalMs = 4000) {
  if (!inTauri() || timer) return;
  void refreshShellRuns();
  timer = setInterval(() => {
    void refreshShellRuns();
  }, intervalMs);
}

export function stopShellRunsPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
