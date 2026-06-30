/** 应用网格/列表图标：标题首字母 */
export function appInitial(title: string): string {
  const s = title.trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}

/** 由 id 生成稳定的 HSL 背景色 */
export function appTileColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * 17) % 360;
  return `hsl(${hash} 55% 42%)`;
}
