import { XMLBuilder, XMLParser } from "fast-xml-parser";

const ATTR_PREFIX = "@_";
const TEXT_NODE = "#text";
const MAX_EMBEDDED_DEPTH = 10;

/** SOAP 常用默认要去掉的外层字段 */
export const DEFAULT_UNWRAP_FIELDS = ["Envelope", "Body", "Header"];

export interface JsonXmlOptions {
  /** 缩进：数字空格数，或 "tab" */
  indent: number | "tab";
  /** 保留属性（@_ 前缀） */
  keepAttributes: boolean;
  /** 输出 / 保留 XML 声明头 */
  xmlDeclaration: boolean;
  /** 去掉命名空间前缀，如 soap:Envelope → Envelope */
  stripNsPrefix: boolean;
  /** 要去掉的外层字段名；空数组表示不去掉 */
  unwrapFields: string[];
  /** 递归解析字符串中的嵌入 XML（CDATA、as_param 等，非 XML 标准而是接口约定） */
  parseEmbeddedXml: boolean;
}

function indentString(indent: number | "tab"): string {
  return indent === "tab" ? "\t" : " ".repeat(indent);
}

function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj);
}

function contentKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => k !== TEXT_NODE && !k.startsWith(ATTR_PREFIX));
}

/** soap:Envelope → Envelope；保留 @_ 属性键与 #text */
export function stripNsLocalName(name: string): string {
  if (name.startsWith(ATTR_PREFIX) || name === TEXT_NODE) return name;
  const colon = name.indexOf(":");
  return colon > 0 ? name.slice(colon + 1) : name;
}

/** 递归去掉 JSON 对象键上的命名空间前缀 */
export function stripNsFromObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNsFromObject);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    out[stripNsLocalName(key)] = stripNsFromObject(value);
  }
  return out;
}

function fieldMatches(key: string, pattern: string, matchLocalName: boolean): boolean {
  if (matchLocalName) {
    return stripNsLocalName(key) === stripNsLocalName(pattern);
  }
  return key === pattern;
}

function matchesAnyField(
  key: string,
  fields: string[],
  matchLocalName: boolean,
): boolean {
  return fields.some((pattern) => fieldMatches(key, pattern, matchLocalName));
}

/** 字符串是否像一段 XML（CDATA 解包后的 as_param 等） */
export function looksLikeXmlString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<") || !trimmed.includes(">")) return false;
  if (trimmed.startsWith("<?")) return true;
  return /^<[A-Za-z_][\w.-]*(\s|>|\/)/.test(trimmed);
}

/** 仅用于 unwrap：空 Header、空字符串等可删；有内容的字符串（CDATA XML）不能删 */
function isEmptyUnwrapValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (isPlainObject(v) && contentKeys(v).length === 0) return true;
  return false;
}

/**
 * 按用户配置的字段名去掉外层包裹。
 * - 单独一层匹配字段 → 进入内层
 * - 匹配且值为对象 → 提升子节点到当前层
 * - 匹配且值为空非对象 → 删除（如空 Header）
 */
export function unwrapConfiguredFields(
  obj: unknown,
  fields: string[],
  matchLocalName: boolean,
): unknown {
  const patterns = fields.map((f) => f.trim()).filter(Boolean);
  if (patterns.length === 0) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => unwrapConfiguredFields(item, patterns, matchLocalName));
  }
  if (!isPlainObject(obj)) return obj;

  let node: Record<string, unknown> = obj;
  let changed = true;
  let passes = 0;

  while (changed && isPlainObject(node) && passes < 50) {
    passes += 1;
    changed = false;
    const keys = contentKeys(node);

    if (keys.length === 1 && matchesAnyField(keys[0]!, patterns, matchLocalName)) {
      const inner = node[keys[0]!];
      if (isPlainObject(inner)) {
        node = inner;
        changed = true;
        continue;
      }
    }

    const hoistKeys = keys.filter(
      (k) => matchesAnyField(k, patterns, matchLocalName) && isPlainObject(node[k]),
    );
    const hasDelete = keys.some(
      (k) =>
        matchesAnyField(k, patterns, matchLocalName) &&
        !isPlainObject(node[k]) &&
        isEmptyUnwrapValue(node[k]),
    );

    if (hoistKeys.length > 0 || hasDelete) {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === TEXT_NODE || k.startsWith(ATTR_PREFIX)) {
          next[k] = v;
          continue;
        }
        if (hoistKeys.includes(k) && isPlainObject(v)) {
          for (const [ck, cv] of Object.entries(v)) {
            if (ck === TEXT_NODE || ck.startsWith(ATTR_PREFIX)) continue;
            next[ck] = cv;
          }
          changed = true;
        } else if (!matchesAnyField(k, patterns, matchLocalName)) {
          next[k] = v;
        } else if (!isEmptyUnwrapValue(v)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      node = next;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === TEXT_NODE || k.startsWith(ATTR_PREFIX)) {
      out[k] = v;
    } else {
      out[k] = unwrapConfiguredFields(v, patterns, matchLocalName);
    }
  }
  return out;
}

function parseEmbeddedXmlDeep(
  obj: unknown,
  opts: JsonXmlOptions,
  depth: number,
): unknown {
  if (depth > MAX_EMBEDDED_DEPTH) return obj;

  if (typeof obj === "string") {
    if (!opts.parseEmbeddedXml || !looksLikeXmlString(obj)) return obj;
    try {
      const parser = new XMLParser(parserOptions(opts));
      const parsed = parser.parse(obj.trim());
      const stripped = opts.stripNsPrefix ? stripNsFromObject(parsed) : parsed;
      return parseEmbeddedXmlDeep(stripped, opts, depth + 1);
    } catch {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => parseEmbeddedXmlDeep(item, opts, depth));
  }

  if (isPlainObject(obj)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = parseEmbeddedXmlDeep(v, opts, depth);
    }
    return out;
  }

  return obj;
}

function postProcess(obj: unknown, opts: JsonXmlOptions): unknown {
  let value = obj;
  if (opts.stripNsPrefix) value = stripNsFromObject(value);
  // 先解析 CDATA / as_param 内嵌 XML，再 unwrap；否则 as_param 还是字符串会被误删
  if (opts.parseEmbeddedXml) {
    value = parseEmbeddedXmlDeep(value, opts, 0);
  }
  if (opts.unwrapFields.length > 0) {
    value = unwrapConfiguredFields(value, opts.unwrapFields, opts.stripNsPrefix);
  }
  return value;
}

function parserOptions(opts: JsonXmlOptions) {
  const strip = opts.stripNsPrefix
    ? (name: string) => stripNsLocalName(name)
    : false;
  return {
    ignoreAttributes: !opts.keepAttributes,
    attributeNamePrefix: ATTR_PREFIX,
    textNodeName: TEXT_NODE,
    ignoreDeclaration: !opts.xmlDeclaration,
    removeNSPrefix: opts.stripNsPrefix,
    transformTagName: strip,
    transformAttributeName: strip,
    parseAttributeValue: false,
    parseTagValue: true,
    trimValues: true,
  };
}

/** JSON 文本 → XML 文本 */
export function jsonToXml(input: string, opts: JsonXmlOptions): string {
  const obj = postProcess(JSON.parse(input), opts);

  const builder = new XMLBuilder({
    ignoreAttributes: !opts.keepAttributes,
    attributeNamePrefix: ATTR_PREFIX,
    textNodeName: TEXT_NODE,
    format: true,
    indentBy: indentString(opts.indent),
    suppressEmptyNode: true,
    suppressBooleanAttributes: false,
  });
  let xml = String(builder.build(obj)).trimEnd();
  if (opts.xmlDeclaration && !/^\s*<\?xml/i.test(xml)) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  }
  return xml;
}

/** XML 文本 → JSON 文本 */
export function xmlToJson(input: string, opts: JsonXmlOptions): string {
  const parser = new XMLParser(parserOptions(opts));
  const obj = postProcess(parser.parse(input), opts);
  const space = opts.indent === "tab" ? "\t" : opts.indent;
  return JSON.stringify(obj, null, space);
}
