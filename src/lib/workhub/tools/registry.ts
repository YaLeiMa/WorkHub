import { t } from "@/i18n";
import type { ToolDefinition } from "./types";
import { qrcodeTool } from "./builtin/qrcode";
import { jsonFormatTool } from "./builtin/jsonFormat";
import { colorConvertTool } from "./builtin/colorConvert";
import { base64Tool } from "./builtin/base64";
import { jsonXmlTool } from "./builtin/jsonXml";

/** 工具箱注册表：在此登记所有工具 */
export const TOOLS: ToolDefinition[] = [
  qrcodeTool,
  jsonFormatTool,
  colorConvertTool,
  base64Tool,
  jsonXmlTool,
];

export function getTool(id: string | null | undefined): ToolDefinition | undefined {
  if (!id) return undefined;
  return TOOLS.find((tool) => tool.id === id);
}

/** 工具名（已翻译） */
export function toolName(tool: ToolDefinition): string {
  return t(tool.nameKey);
}

/** 工具描述（已翻译） */
export function toolDesc(tool: ToolDefinition): string {
  return tool.descKey ? t(tool.descKey) : "";
}

/** 泛指「工具箱」的检索词（中/英导航文案 + 常用别名） */
function toolboxQueryTerms(): string[] {
  return [
    t("nav.tools"),
    t("tools.title"),
    t("searchGroup.tool"),
    "tool",
    "tools",
    "toolbox",
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 输入为「工具 / 工具箱 / tools」等泛指词时，列出全部工具 */
function matchesToolboxOverviewQuery(kw: string): boolean {
  const k = kw.trim().toLowerCase();
  if (k.length < 2) return false;
  return toolboxQueryTerms().some(
    (term) => term === k || term.includes(k) || k.includes(term),
  );
}

/** 按关键词匹配工具（名称 / 描述 / keywords） */
export function searchTools(kw: string): ToolDefinition[] {
  const k = kw.trim().toLowerCase();
  if (!k) return TOOLS;
  if (matchesToolboxOverviewQuery(k)) return TOOLS;
  return TOOLS.filter((tool) => {
    const name = toolName(tool).toLowerCase();
    const desc = toolDesc(tool).toLowerCase();
    const keys = (tool.keywords ?? []).map((w) => w.toLowerCase());
    return (
      name.includes(k) ||
      desc.includes(k) ||
      tool.id.includes(k) ||
      keys.some((w) => w.includes(k))
    );
  });
}
