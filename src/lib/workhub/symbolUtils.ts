export interface SymbolPreset {
  symbol: string;
  title: string;
  tags: string[];
  keywords: string[];
}

export interface SymbolGroup {
  id: string;
  label: string;
  items: SymbolPreset[];
}

/** 内置符号库：开发文档 + 表情，一键点选 */
export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: "arrow",
    label: "箭头",
    items: [
      { symbol: "→", title: "右箭头", tags: ["箭头", "流程"], keywords: ["箭头", "右", "arrow", "right"] },
      { symbol: "←", title: "左箭头", tags: ["箭头"], keywords: ["箭头", "左", "left"] },
      { symbol: "↑", title: "上箭头", tags: ["箭头"], keywords: ["箭头", "上", "up"] },
      { symbol: "↓", title: "下箭头", tags: ["箭头"], keywords: ["箭头", "下", "down"] },
      { symbol: "↗", title: "右上箭头", tags: ["箭头"], keywords: ["箭头", "右上"] },
      { symbol: "⇒", title: "双线右箭头", tags: ["箭头", "逻辑"], keywords: ["箭头", "推出", "implies"] },
    ],
  },
  {
    id: "status",
    label: "标记",
    items: [
      { symbol: "✓", title: "勾号", tags: ["完成", "勾选"], keywords: ["勾", "对勾", "check", "tick", "完成", "ok"] },
      { symbol: "✗", title: "叉号", tags: ["取消", "错误"], keywords: ["叉", "错", "cross", "no"] },
      { symbol: "●", title: "实心圆点", tags: ["列表"], keywords: ["圆点", "bullet"] },
      { symbol: "○", title: "空心圆", tags: ["列表"], keywords: ["圆圈", "circle"] },
      { symbol: "★", title: "实心星", tags: ["收藏", "强调"], keywords: ["星", "star", "收藏"] },
      { symbol: "☆", title: "空心星", tags: ["收藏"], keywords: ["星", "star"] },
    ],
  },
  {
    id: "math",
    label: "数学",
    items: [
      { symbol: "×", title: "乘号", tags: ["数学"], keywords: ["乘", "times", "x"] },
      { symbol: "÷", title: "除号", tags: ["数学"], keywords: ["除", "divide"] },
      { symbol: "±", title: "正负号", tags: ["数学"], keywords: ["正负", "plus", "minus"] },
      { symbol: "≈", title: "约等于", tags: ["数学"], keywords: ["约等于", "approx"] },
      { symbol: "≠", title: "不等于", tags: ["数学"], keywords: ["不等于", "not equal"] },
      { symbol: "∞", title: "无穷", tags: ["数学"], keywords: ["无穷", "infinity"] },
    ],
  },
  {
    id: "dev",
    label: "开发",
    items: [
      { symbol: "©", title: "版权", tags: ["法律", "页脚"], keywords: ["版权", "copyright"] },
      { symbol: "®", title: "注册商标", tags: ["法律"], keywords: ["注册", "registered"] },
      { symbol: "™", title: "商标", tags: ["法律"], keywords: ["商标", "trademark"] },
      { symbol: "§", title: "章节符", tags: ["文档"], keywords: ["章节", "section"] },
      { symbol: "¶", title: "段落符", tags: ["文档"], keywords: ["段落", "pilcrow"] },
      { symbol: "⌘", title: "Command 键", tags: ["Mac", "快捷键"], keywords: ["command", "mac", "快捷键"] },
      { symbol: "⌥", title: "Option 键", tags: ["Mac", "快捷键"], keywords: ["option", "alt", "mac"] },
      { symbol: "⌃", title: "Control 键", tags: ["Mac", "快捷键"], keywords: ["control", "ctrl", "mac"] },
    ],
  },
  {
    id: "emoji",
    label: "Emoji",
    items: [
      { symbol: "🔥", title: "火", tags: ["emoji", "热门"], keywords: ["火", "fire", "热", "hot"] },
      { symbol: "✨", title: "闪光", tags: ["emoji"], keywords: ["闪", "sparkle", "新"] },
      { symbol: "💡", title: "灯泡", tags: ["emoji", "想法"], keywords: ["灯泡", "idea", "提示", "tip"] },
      { symbol: "🚀", title: "火箭", tags: ["emoji", "发布"], keywords: ["火箭", "rocket", "发布", "ship"] },
      { symbol: "⚠️", title: "警告", tags: ["emoji", "注意"], keywords: ["警告", "warning", "注意"] },
      { symbol: "✅", title: "完成", tags: ["emoji", "勾"], keywords: ["完成", "done", "勾", "check"] },
      { symbol: "❌", title: "失败", tags: ["emoji", "叉"], keywords: ["失败", "错误", "fail", "叉"] },
      { symbol: "🐛", title: "Bug", tags: ["emoji", "开发"], keywords: ["bug", "虫子", "缺陷"] },
      { symbol: "🎉", title: "庆祝", tags: ["emoji"], keywords: ["庆祝", "party", "完成"] },
      { symbol: "👀", title: "围观", tags: ["emoji"], keywords: ["看", "eyes", "关注"] },
    ],
  },
];

const SYMBOL_SEARCH_ALIASES = ["符号", "emoji", "表情", "特殊字符", "字符"];

export function isSymbolSnippet(category: string): boolean {
  return category === "符号";
}

/** 取首行作为符号内容，限制长度避免误粘贴大段文本 */
export function normalizeSymbol(input: string): string | undefined {
  const raw = input.trim().split("\n")[0]?.trim() ?? "";
  if (!raw) return undefined;
  if (raw.length > 16) return undefined;
  return raw;
}

export function isValidSymbol(input: string): boolean {
  return !!normalizeSymbol(input);
}

export function snippetSymbolGlyph(snippet: {
  category: string;
  code: string;
}): string | undefined {
  if (!isSymbolSnippet(snippet.category)) return undefined;
  return normalizeSymbol(snippet.code);
}

function presetMatches(preset: SymbolPreset, match: (s: string) => boolean, kw: string): boolean {
  if (match(preset.symbol) || match(preset.title)) return true;
  if (preset.tags.some(match)) return true;
  if (preset.keywords.some((k) => match(k) || k.includes(kw) || kw.includes(k))) return true;
  return false;
}

export function symbolMatchesSearch(
  snippet: { title: string; category: string; code: string; tags: string[] },
  match: (s: string) => boolean,
  kw: string,
): boolean {
  if (!isSymbolSnippet(snippet.category)) return false;

  const q = kw.trim().toLowerCase();
  if (!q) return false;

  if (SYMBOL_SEARCH_ALIASES.some((a) => a === q || a.includes(q) || q.includes(a))) {
    return true;
  }

  const glyph = normalizeSymbol(snippet.code);
  if (glyph && match(glyph)) return true;

  for (const group of SYMBOL_GROUPS) {
    for (const preset of group.items) {
      if (preset.symbol !== glyph) continue;
      if (presetMatches(preset, match, q)) return true;
    }
  }

  return false;
}
