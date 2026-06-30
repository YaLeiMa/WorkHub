import type { ItemKind } from "./types";

export interface FileTypeBadge {
  letter: string;
  bg: string;
  fg: string;
}

export type WhGlyphIcon =
  | "project"
  | "snippet"
  | "link"
  | "command"
  | "file"
  | "clipboard"
  | "image"
  | "archive"
  | "app"
  | "tool";

export type ItemIconVisual =
  | { mode: "badge"; badge: FileTypeBadge }
  | { mode: "folder" }
  | { mode: "glyph"; name: WhGlyphIcon; tint?: string };

const EXT_BADGES: Record<string, FileTypeBadge> = {
  doc: { letter: "W", bg: "#2B579A", fg: "#FFFFFF" },
  docx: { letter: "W", bg: "#2B579A", fg: "#FFFFFF" },
  pdf: { letter: "P", bg: "#E53935", fg: "#FFFFFF" },
  xls: { letter: "E", bg: "#217346", fg: "#FFFFFF" },
  xlsx: { letter: "E", bg: "#217346", fg: "#FFFFFF" },
  csv: { letter: "E", bg: "#217346", fg: "#FFFFFF" },
  md: { letter: "M", bg: "#1F2329", fg: "#FFFFFF" },
  mdx: { letter: "M", bg: "#1F2329", fg: "#FFFFFF" },
  ppt: { letter: "P", bg: "#D24726", fg: "#FFFFFF" },
  pptx: { letter: "P", bg: "#D24726", fg: "#FFFFFF" },
  txt: { letter: "T", bg: "#8B949E", fg: "#FFFFFF" },
  json: { letter: "J", bg: "#646A73", fg: "#FFFFFF" },
  jsonc: { letter: "J", bg: "#646A73", fg: "#FFFFFF" },
  ts: { letter: "TS", bg: "#3178C6", fg: "#FFFFFF" },
  tsx: { letter: "TS", bg: "#3178C6", fg: "#FFFFFF" },
  js: { letter: "JS", bg: "#F7DF1E", fg: "#1F2329" },
  jsx: { letter: "JS", bg: "#F7DF1E", fg: "#1F2329" },
  vue: { letter: "V", bg: "#42B883", fg: "#FFFFFF" },
  html: { letter: "H", bg: "#E44D26", fg: "#FFFFFF" },
  htm: { letter: "H", bg: "#E44D26", fg: "#FFFFFF" },
  css: { letter: "#", bg: "#7C3AED", fg: "#FFFFFF" },
  scss: { letter: "#", bg: "#7C3AED", fg: "#FFFFFF" },
  less: { letter: "#", bg: "#7C3AED", fg: "#FFFFFF" },
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2"]);

function extFromHint(hint?: string): string {
  if (!hint) return "";
  const raw = hint.trim();
  if (!raw) return "";
  const pathPart = raw.replace(/[?#].*$/, "").replace(/\\/g, "/");
  const base = pathPart.split("/").pop() ?? pathPart;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function badgeFromExt(ext: string): FileTypeBadge | undefined {
  if (EXT_BADGES[ext]) return EXT_BADGES[ext];
  if (IMAGE_EXTS.has(ext)) return undefined;
  if (ARCHIVE_EXTS.has(ext)) return undefined;
  if (!ext) return undefined;
  const letter = ext.length <= 2 ? ext.toUpperCase() : ext.slice(0, 2).toUpperCase();
  return { letter, bg: "#9AA0A6", fg: "#FFFFFF" };
}

function glyphFromExt(ext: string): WhGlyphIcon {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  return "file";
}

/** 根据条目类型与路径/标题推断左侧图标 */
export function resolveItemIcon(
  kind: ItemKind,
  pathHint?: string,
): ItemIconVisual {
  const ext = extFromHint(pathHint);

  switch (kind) {
    case "folder":
      return { mode: "folder" };
    case "file":
    case "doc": {
      const badge = badgeFromExt(ext);
      if (badge) return { mode: "badge", badge };
      return { mode: "glyph", name: glyphFromExt(ext) };
    }
    case "project":
      return { mode: "glyph", name: "project", tint: "#3370FF" };
    case "snippet":
      return { mode: "glyph", name: "snippet", tint: "#D99100" };
    case "link":
      return { mode: "glyph", name: "link", tint: "#3370FF" };
    case "command":
      return { mode: "glyph", name: "command", tint: "#2BA471" };
    case "clipboard":
      return { mode: "glyph", name: "clipboard", tint: "#646A73" };
    case "app":
      return { mode: "glyph", name: "app", tint: "#7C3AED" };
    case "tool":
      return { mode: "glyph", name: "tool", tint: "#2BA471" };
    default:
      return { mode: "glyph", name: "file" };
  }
}
