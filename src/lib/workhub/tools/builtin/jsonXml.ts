import type { ToolDefinition } from "../types";
import JsonXmlTool from "@/components/workhub/tools/JsonXmlTool.vue";

/** JSON ↔ XML 互转：基于 fast-xml-parser，支持属性 / 声明头 */
export const jsonXmlTool: ToolDefinition = {
  id: "json-xml",
  nameKey: "tools.jsonXml.name",
  descKey: "tools.jsonXml.desc",
  icon: "snippet",
  tint: "#7B61FF",
  category: "convert",
  keywords: [
    "json",
    "xml",
    "convert",
    "转换",
    "互转",
    "xml2json",
    "json2xml",
  ],
  component: JsonXmlTool,
};
