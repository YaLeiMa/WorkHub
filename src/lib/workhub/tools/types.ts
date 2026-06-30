import type { Component } from "vue";

/** 工具表单字段类型 */
export type ToolFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "switch"
  | "color"
  | "slider";

export interface ToolFieldOption {
  /** i18n key 或直接展示文案（见 ToolField.optionsRaw） */
  label: string;
  value: string;
}

export interface ToolField {
  /** 在 values 中的键 */
  key: string;
  type: ToolFieldType;
  /** 字段标签的 i18n key */
  labelKey: string;
  /** 占位符 i18n key */
  placeholderKey?: string;
  /** 默认值 */
  default?: ToolFieldValue;
  /** select 选项；label 默认按 i18n key 解析，除非 optionsRaw=true */
  options?: ToolFieldOption[];
  /** 为 true 时 options.label 视为已是最终文案，不走 i18n */
  optionsRaw?: boolean;
  /** number / slider 范围 */
  min?: number;
  max?: number;
  step?: number;
  /** 是否等宽字体（textarea 代码输入） */
  mono?: boolean;
  /** 条件显隐：返回 false 时隐藏该字段 */
  visibleWhen?: (values: ToolValues) => boolean;
}

export type ToolFieldValue = string | number | boolean;
export type ToolValues = Record<string, ToolFieldValue>;

export interface ToolCopyLine {
  label: string;
  value: string;
}

/** 工具运行结果的展示描述符（声明式 UI） */
export type ToolResultView =
  | { type: "text"; value: string; copyable?: boolean }
  | { type: "copyLines"; items: ToolCopyLine[] }
  | { type: "code"; value: string; language?: string }
  | { type: "image"; src: string; downloadName?: string; alt?: string }
  | { type: "error"; message: string }
  | { type: "custom"; component: Component; props?: Record<string, unknown> };

/** 运行上下文：让工具访问宿主能力（Tauri / 复制 / 提示 / i18n） */
export interface ToolContext {
  /** 调用 Tauri command（浏览器预览下为 no-op 抛错由调用方处理） */
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  /** 复制文本到剪贴板并提示 */
  copy: (text: string, successText?: string) => void;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
  };
  /** 翻译函数 */
  t: (key: string, named?: Record<string, unknown>) => string;
}

export type ToolCategory = "encode" | "format" | "generate" | "convert" | "other";

export interface ToolDefinition {
  /** 全局唯一 id */
  id: string;
  /** 工具名 i18n key */
  nameKey: string;
  /** 描述 i18n key */
  descKey?: string;
  /** WhIcon 图标名 */
  icon: string;
  /** 图标着色 */
  tint?: string;
  /** 额外搜索关键词（原文，不走 i18n） */
  keywords?: string[];
  category: ToolCategory;
  /**
   * 模式 A：声明式。提供 fields + run，由 DynamicToolForm / ToolResultView 渲染。
   */
  fields?: ToolField[];
  /** 运行模式：live 输入即算；manual 点按钮才算（默认 manual） */
  runMode?: "live" | "manual";
  /** 运行函数，返回结果描述符 */
  run?: (
    values: ToolValues,
    ctx: ToolContext,
  ) => ToolResultView | Promise<ToolResultView>;
  /**
   * 模式 B：逃生舱。提供自定义组件，自行渲染表单与结果。
   * 组件会收到 prop `ctx: ToolContext`。
   */
  component?: Component;
}
