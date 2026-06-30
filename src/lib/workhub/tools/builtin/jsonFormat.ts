import type { ToolDefinition, ToolResultView, ToolValues } from "../types";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** JSON 美化：解析后按缩进重新序列化，支持键排序 */
export const jsonFormatTool: ToolDefinition = {
  id: "json-format",
  nameKey: "tools.jsonFormat.name",
  descKey: "tools.jsonFormat.desc",
  icon: "snippet",
  tint: "#D99100",
  category: "format",
  keywords: ["json", "format", "beautify", "美化", "格式化"],
  runMode: "live",
  fields: [
    {
      key: "input",
      type: "textarea",
      labelKey: "tools.jsonFormat.fieldInput",
      placeholderKey: "tools.jsonFormat.fieldInputPlaceholder",
      default: "",
      mono: true,
    },
    {
      key: "indent",
      type: "select",
      labelKey: "tools.jsonFormat.fieldIndent",
      default: "2",
      optionsRaw: true,
      options: [
        { label: "2 spaces", value: "2" },
        { label: "4 spaces", value: "4" },
        { label: "Tab", value: "tab" },
        { label: "Minify", value: "0" },
      ],
    },
    {
      key: "sortKeys",
      type: "switch",
      labelKey: "tools.jsonFormat.fieldSort",
      default: false,
    },
  ],
  run(values: ToolValues, ctx): ToolResultView {
    const input = String(values.input ?? "").trim();
    if (!input) {
      return { type: "error", message: ctx.t("tools.jsonFormat.empty") };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        type: "error",
        message: ctx.t("tools.jsonFormat.invalid", { msg }),
      };
    }
    if (values.sortKeys) parsed = sortValue(parsed);

    const indentRaw = String(values.indent ?? "2");
    let indent: number | string;
    if (indentRaw === "tab") indent = "\t";
    else if (indentRaw === "0") indent = 0;
    else indent = Number(indentRaw) || 2;

    const value = JSON.stringify(parsed, null, indent);
    return { type: "code", value, language: "json" };
  },
};
