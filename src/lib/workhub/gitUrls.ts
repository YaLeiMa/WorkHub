export type GitHostProvider = "github" | "gitlab";

export interface ParsedGitRemote {
  provider: GitHostProvider;
  owner: string;
  repo: string;
}

/** 从项目 gitUrl 解析 GitHub / GitLab 仓库信息 */
export function parseGitRemoteUrl(gitUrl: string): ParsedGitRemote | null {
  const trimmed = gitUrl.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\.git$/i, "");
  const github = normalized.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (github) {
    return { provider: "github", owner: github[1], repo: github[2] };
  }
  const gitlab = normalized.match(/gitlab\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (gitlab) {
    return { provider: "gitlab", owner: gitlab[1], repo: gitlab[2] };
  }
  return null;
}

/** GitHub Releases / GitLab Releases 新建页 */
export function gitReleaseUrl(gitUrl: string): string | null {
  const remote = parseGitRemoteUrl(gitUrl);
  if (!remote) return null;
  if (remote.provider === "github") {
    return `https://github.com/${remote.owner}/${remote.repo}/releases/new`;
  }
  return `https://gitlab.com/${remote.owner}/${remote.repo}/-/releases/new`;
}

/** 打开 PR / MR 对比页（head = 当前分支） */
export function gitCompareUrl(
  gitUrl: string,
  headBranch: string,
  baseBranch = "main",
): string | null {
  const remote = parseGitRemoteUrl(gitUrl);
  const head = headBranch.trim();
  if (!remote || !head) return null;

  const base = baseBranch.trim() || "main";
  if (remote.provider === "github") {
    return `https://github.com/${remote.owner}/${remote.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1`;
  }
  const params = new URLSearchParams({
    "merge_request[source_branch]": head,
    "merge_request[target_branch]": base,
  });
  return `https://gitlab.com/${remote.owner}/${remote.repo}/-/merge_requests/new?${params}`;
}
