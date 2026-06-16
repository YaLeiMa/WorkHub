const HEX_WITH_HASH =
  /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const HEX_PLAIN = /^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/** 规范为 #RRGGBB（大写）；无效则返回 undefined */
export function normalizeHex(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;

  let hex = raw;
  if (!hex.startsWith("#")) {
    if (!HEX_PLAIN.test(hex)) return undefined;
    hex = `#${hex}`;
  }
  if (!HEX_WITH_HASH.test(hex)) return undefined;

  const body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    const expanded = body
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
    return `#${expanded}`.toUpperCase();
  }
  if (body.length === 6) return `#${body}`.toUpperCase();
  if (body.length === 8) return `#${body.slice(0, 6)}`.toUpperCase();
  return undefined;
}

export function isValidHex(input: string): boolean {
  return !!normalizeHex(input);
}

export function isColorSnippet(category: string): boolean {
  return category === "颜色";
}

export function snippetSwatchHex(snippet: {
  category: string;
  code: string;
}): string | undefined {
  if (!isColorSnippet(snippet.category)) return undefined;
  return normalizeHex(snippet.code.split("\n")[0] ?? "");
}

const COLOR_SEARCH_ALIASES = ["颜色", "color", "hex", "色值", "色"];

export function colorMatchesSearch(
  snippet: { title: string; category: string; code: string; tags: string[] },
  _match: (s: string) => boolean,
  kw: string,
): boolean {
  if (!isColorSnippet(snippet.category)) return false;
  const q = kw.trim().toLowerCase();
  if (!q) return false;
  if (COLOR_SEARCH_ALIASES.some((a) => a === q || a.includes(q) || q.includes(a))) {
    return true;
  }
  const hex = normalizeHex(snippet.code);
  if (hex) {
    const body = hex.slice(1).toLowerCase();
    const qBody = q.replace(/^#/, "");
    if (qBody && (body.includes(qBody) || qBody.includes(body))) return true;
  }
  return false;
}
