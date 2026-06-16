export interface SnippetVariable {
  name: string;
  defaultValue: string;
}

const VAR_RE = /\{\{([^{}]+)\}\}/g;

function parseVariableSpec(raw: string): { name: string; defaultValue: string } {
  const trimmed = raw.trim();
  const colon = trimmed.indexOf(":");
  if (colon >= 0) {
    return {
      name: trimmed.slice(0, colon).trim(),
      defaultValue: trimmed.slice(colon + 1),
    };
  }
  return { name: trimmed, defaultValue: "" };
}

/** 从片段代码中提取 {{name}} 或 {{name:默认值}} 变量（按出现顺序去重） */
export function extractSnippetVariables(code: string): SnippetVariable[] {
  const seen = new Set<string>();
  const vars: SnippetVariable[] = [];
  for (const m of code.matchAll(VAR_RE)) {
    const { name, defaultValue } = parseVariableSpec(m[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    vars.push({ name, defaultValue });
  }
  return vars;
}

export function hasSnippetVariables(code: string): boolean {
  return extractSnippetVariables(code).length > 0;
}

/** 用给定值替换 {{变量}}；未填写的变量使用默认值（若有） */
export function applySnippetVariables(
  code: string,
  values: Record<string, string>,
): string {
  return code.replace(VAR_RE, (_, raw: string) => {
    const { name, defaultValue } = parseVariableSpec(raw);
    if (!name) return `{{${raw}}}`;
    const v = values[name];
    if (v !== undefined) return v;
    return defaultValue;
  });
}
