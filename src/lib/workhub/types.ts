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
  | "tool";

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
