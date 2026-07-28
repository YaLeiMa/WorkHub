// WorkHub 数据模型（V1，纯前端 mock）

export type ItemKind =
  | "project"
  | "snippet"
  | "link"
  | "command"
  | "file"
  | "folder"
  | "doc"
  | "clipboard"
  | "app"
  | "tool"
  | "workflow"
  | "git_branch";

export interface ClipboardEntry {
  id: string;
  content: string;
  preview: string;
  createdAt: number;
  /** 堆栈固定项（不参与历史条数淘汰） */
  pinned: boolean;
  pinnedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;
  gitUrl: string;
  /** 分组路径，用 / 分隔，最多 3 层；空字符串表示未分组 */
  group: string;
  /** 组内排序，越小越靠前 */
  sortOrder: number;
  tags: string[];
  favorite: boolean;
  updatedAt: number;
  links: { id: string; title: string; url: string }[];
  commands: { id: string; title: string; command: string }[];
  docs: { id: string; title: string; path: string }[];
}

export type SnippetCategory =
  | "shell"
  | "git"
  | "sql"
  | "代码"
  | "正则"
  | "颜色"
  | "符号"
  | "其他";

export interface Snippet {
  id: string;
  title: string;
  category: SnippetCategory;
  language: string;
  tags: string[];
  code: string;
  favorite: boolean;
  updatedAt: number;
}

export interface Favorite {
  id: string;
  kind: "file" | "folder" | "link" | "doc";
  title: string;
  target: string; // 路径或 URL
  tags: string[];
  updatedAt: number;
}

/** 快捷启动应用（独立「应用」页） */
export interface LauncherApp {
  id: string;
  title: string;
  /** .exe / .lnk / .url / .app / .AppImage 等 */
  target: string;
  sortOrder: number;
  tags: string[];
  updatedAt: number;
}

export interface RecentEntry {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle?: string;
  refId: string;
  at: number;
}

/** Workflow 步骤类型（MVP） */
export type WorkflowStepType =
  | "copy_snippet"
  | "copy_text"
  | "copy_project_command"
  | "open_link"
  | "open_project_link"
  | "open_path"
  | "open_vscode"
  | "launch_app"
  | "run_shell"
  | "run_workflow"
  | "delay"
  | "notify";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title?: string;
  /** 同 parallelGroup 值的步骤并行执行 */
  parallelGroup?: number;
  config: Record<string, unknown>;
  continueOnError?: boolean;
}

export interface Workflow {
  id: string;
  title: string;
  description: string;
  /** 可选绑定项目，用于 {{project.*}} 变量与 open_vscode */
  projectId?: string;
  tags: string[];
  favorite: boolean;
  steps: WorkflowStep[];
  /** 全局快捷键，如 Ctrl+Shift+D */
  hotkey?: string;
  updatedAt: number;
}

export interface GitRepoStatus {
  hasRepo: boolean;
  branch?: string;
  isDirty: boolean;
}

export interface GitBranchList {
  hasRepo: boolean;
  current?: string;
  branches: string[];
}
