import { ref } from "vue";
import { navigate } from "../nav";
import { getDb, inTauri } from "../db";
import { getMeta, setMeta } from "../meta";
import { isSpotlightWindow } from "../windowActions";
import { getTool } from "./registry";

const STORAGE_KEY = "tool_active_id";
const META_KEY = "tool_active_id";

/**
 * 工具宿主状态（每个窗口各自维护，主窗口与悬浮窗是独立 JS 上下文）。
 * - 悬浮窗：activeToolId 置位后就地展开工具面板。
 * - 主窗口：先导航到 /tools，再置位 activeToolId 由 ToolsPage 渲染。
 * - 上次打开的工具会持久化，切走再回来仍停在工具详情。
 */
export const activeToolId = ref<string | null>(null);

async function persistActiveToolId(id: string | null) {
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, META_KEY, id ?? "");
  } else if (id) {
    localStorage.setItem(STORAGE_KEY, id);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function initToolHost() {
  let raw: string | null = null;
  if (inTauri()) {
    const db = await getDb();
    if (db) raw = await getMeta(db, META_KEY);
  } else {
    raw = localStorage.getItem(STORAGE_KEY);
  }
  if (raw && getTool(raw)) activeToolId.value = raw;
}

export function openTool(id: string) {
  if (!getTool(id)) return;
  activeToolId.value = id;
  void persistActiveToolId(id);
  if (isSpotlightWindow()) return;
  void navigate("/tools");
}

export function closeTool() {
  activeToolId.value = null;
  void persistActiveToolId(null);
}
