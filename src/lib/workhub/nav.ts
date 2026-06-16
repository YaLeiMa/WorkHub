import { ref } from "vue";
import { isSpotlightWindow, showMainWindow } from "./windowActions";

/**
 * 轻量导航 store（暂不引入 vue-router）
 * 仅维护当前模块路径，供 Shell 切换主区视图与高亮左侧导航。
 * 悬浮窗内跳转时会打开主窗口并隐藏悬浮窗。
 */
export const currentPath = ref("/");

export async function navigate(path: string) {
  if (isSpotlightWindow()) {
    await showMainWindow({ path });
    return;
  }
  currentPath.value = path;
}
