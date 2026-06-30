import type { ToolDefinition } from "../types";
import Base64Tool from "@/components/workhub/tools/Base64Tool.vue";

/** Base64 编解码：文本互转 + 图片拖拽生成 / 预览 */
export const base64Tool: ToolDefinition = {
  id: "base64",
  nameKey: "tools.base64.name",
  descKey: "tools.base64.desc",
  icon: "command",
  tint: "#3370FF",
  category: "encode",
  keywords: [
    "base64",
    "编码",
    "解码",
    "encode",
    "decode",
    "图片",
    "image",
    "dataurl",
  ],
  component: Base64Tool,
};
