import type { ToolDefinition, ToolResultView, ToolValues } from "../types";
import { formatColorItems, parseColorInput } from "./colorConvertLogic";

/** 色值转换：HEX / RGB / HSL 互转 */
export const colorConvertTool: ToolDefinition = {
  id: "color-convert",
  nameKey: "tools.colorConvert.name",
  descKey: "tools.colorConvert.desc",
  icon: "snippet",
  tint: "#7C3AED",
  category: "convert",
  keywords: [
    "color",
    "hex",
    "rgb",
    "hsl",
    "色值",
    "颜色",
    "转换",
    "#",
  ],
  runMode: "live",
  fields: [
    {
      key: "input",
      type: "text",
      labelKey: "tools.colorConvert.fieldInput",
      placeholderKey: "tools.colorConvert.fieldInputPlaceholder",
      default: "#409EFF",
    },
  ],
  run(values: ToolValues, ctx): ToolResultView {
    const input = String(values.input ?? "").trim();
    if (!input) {
      return { type: "error", message: ctx.t("tools.colorConvert.empty") };
    }
    const rgb = parseColorInput(input);
    if (!rgb) {
      return { type: "error", message: ctx.t("tools.colorConvert.invalid") };
    }
    return { type: "copyLines", items: formatColorItems(rgb) };
  },
};
