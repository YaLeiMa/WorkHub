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

/** 按关键词匹配工具（名称 / 描述 / keywords） */
export function searchTools(kw: string): ToolDefinition[] {
  const k = kw.trim().toLowerCase();
  if (!k) return TOOLS;
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
