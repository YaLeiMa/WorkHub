import type { ToolDefinition, ToolResultView, ToolValues } from "../types";

/** 生成二维码：文本 → DataURL 图片 */
export const qrcodeTool: ToolDefinition = {
  id: "qrcode",
  nameKey: "tools.qrcode.name",
  descKey: "tools.qrcode.desc",
  icon: "image",
  tint: "#2BA471",
  category: "generate",
  keywords: ["qr", "qrcode", "二维码", "扫码"],
  runMode: "manual",
  fields: [
    {
      key: "text",
      type: "textarea",
      labelKey: "tools.qrcode.fieldText",
      placeholderKey: "tools.qrcode.fieldTextPlaceholder",
      default: "",
    },
    {
      key: "size",
      type: "select",
      labelKey: "tools.qrcode.fieldSize",
      default: "128",
      optionsRaw: true,
      options: [
        { label: "128 px", value: "128" },
        { label: "256 px", value: "256" },
        { label: "512 px", value: "512" },
      ],
    },
    {
      key: "level",
      type: "select",
      labelKey: "tools.qrcode.fieldLevel",
      default: "M",
      optionsRaw: true,
      options: [
        { label: "L (7%)", value: "L" },
        { label: "M (15%)", value: "M" },
        { label: "Q (25%)", value: "Q" },
        { label: "H (30%)", value: "H" },
      ],
    },
  ],
  async run(values: ToolValues, ctx): Promise<ToolResultView> {
    const text = String(values.text ?? "").trim();
    if (!text) {
      return { type: "error", message: ctx.t("tools.qrcode.empty") };
    }
    const size = Number(values.size) || 128;
    const level = (String(values.level) || "M") as "L" | "M" | "Q" | "H";
    try {
      const QRCode = (await import("qrcode")).default;
      const src = await QRCode.toDataURL(text, {
        width: size,
        margin: 1,
        errorCorrectionLevel: level,
      });
      return {
        type: "image",
        src,
        downloadName: "qrcode.png",
        alt: text,
      };
    } catch {
      return { type: "error", message: ctx.t("tools.qrcode.failed") };
    }
  },
};
