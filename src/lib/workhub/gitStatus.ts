import { reactive } from "vue";
import type { GitRepoStatus } from "./types";
import { inTauri } from "./db";

export const gitStatusStore = reactive<{
  byProjectId: Record<string, GitRepoStatus | undefined>;
  loadedAt: Record<string, number>;
  loading: Set<string>;
}>({
  byProjectId: {},
  loadedAt: {},
  loading: new Set(),
});

const GIT_STATUS_CACHE_TTL_MS = 60_000;

export async function fetchGitStatus(
  projectId: string,
  path: string,
): Promise<GitRepoStatus | undefined> {
  if (!path.trim()) return undefined;
  if (!inTauri()) {
    const stub: GitRepoStatus = { hasRepo: false, isDirty: false };
    gitStatusStore.byProjectId[projectId] = stub;
    return stub;
  }
  if (gitStatusStore.loading.has(projectId)) {
    return gitStatusStore.byProjectId[projectId];
  }
  gitStatusStore.loading.add(projectId);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const status = await invoke<GitRepoStatus>("git_repo_status", { path });
    gitStatusStore.byProjectId[projectId] = status;
    gitStatusStore.loadedAt[projectId] = Date.now();
    return status;
  } catch {
    const fallback: GitRepoStatus = { hasRepo: false, isDirty: false };
    gitStatusStore.byProjectId[projectId] = fallback;
    return fallback;
  } finally {
    gitStatusStore.loading.delete(projectId);
  }
}

export async function refreshGitStatuses(
  items: { id: string; path: string }[],
  limit = 20,
) {
  const slice = items.slice(0, limit);
  const stale = slice.filter((p) => {
    const loaded = gitStatusStore.loadedAt[p.id];
    return !loaded || Date.now() - loaded > GIT_STATUS_CACHE_TTL_MS;
  });
  await Promise.all(stale.map((p) => fetchGitStatus(p.id, p.path)));
}

export function gitStatusLabel(status: GitRepoStatus | undefined): string {
  if (!status?.hasRepo) return "";
  const branch = status.branch ?? "?";
  return status.isDirty ? `${branch} · *` : branch;
}

export interface GitBranchCache {
  hasRepo: boolean;
  current?: string;
  branches: string[];
  loadedAt: number;
}

export const gitBranchStore = reactive<{
  byProjectId: Record<string, GitBranchCache | undefined>;
  loading: Set<string>;
}>({
  byProjectId: {},
  loading: new Set(),
});

const BRANCH_CACHE_TTL_MS = 60_000;

export async function fetchGitBranches(
  projectId: string,
  path: string,
): Promise<GitBranchCache | undefined> {
  if (!path.trim()) return undefined;
  if (!inTauri()) {
    const stub: GitBranchCache = {
      hasRepo: false,
      branches: [],
      loadedAt: Date.now(),
    };
    gitBranchStore.byProjectId[projectId] = stub;
    return stub;
  }
  if (gitBranchStore.loading.has(projectId)) {
    return gitBranchStore.byProjectId[projectId];
  }
  gitBranchStore.loading.add(projectId);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<import("./types").GitBranchList>("git_repo_branches", {
      path,
    });
    const cache: GitBranchCache = {
      hasRepo: result.hasRepo,
      current: result.current,
      branches: result.branches,
      loadedAt: Date.now(),
    };
    gitBranchStore.byProjectId[projectId] = cache;
    return cache;
  } catch {
    const fallback: GitBranchCache = {
      hasRepo: false,
      branches: [],
      loadedAt: Date.now(),
    };
    gitBranchStore.byProjectId[projectId] = fallback;
    return fallback;
  } finally {
    gitBranchStore.loading.delete(projectId);
  }
}

export async function refreshGitBranches(
  items: { id: string; path: string }[],
  limit = 15,
) {
  const slice = items.slice(0, limit);
  const stale = slice.filter((p) => {
    const cached = gitBranchStore.byProjectId[p.id];
    return !cached || Date.now() - cached.loadedAt > BRANCH_CACHE_TTL_MS;
  });
  await Promise.all(stale.map((p) => fetchGitBranches(p.id, p.path)));
}

/** git checkout 命令，分支名含空格时加引号 */
export function gitCheckoutCommand(branch: string): string {
  const safe = branch.includes(" ") || branch.includes('"')
    ? `"${branch.replace(/"/g, '\\"')}"`
    : branch;
  return `git checkout ${safe}`;
}
