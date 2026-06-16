import { loadClipboardHistory, clipboardStore } from "./clipboardStore";
import { favoritesStore, loadFavorites } from "./favoritesStore";
import { loadProjects, projectsStore } from "./projectsStore";
import { loadRecents, recentStore } from "./recentStore";
import { loadSnippets, snippetsStore } from "./snippetsStore";

let initPromise: Promise<void> | null = null;

/** 启动时串行加载各 store，避免与首屏写入竞态覆盖内存列表 */
export function initWorkhubData(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await loadProjects();
      await loadSnippets();
      await loadFavorites();
      await loadRecents();
      await loadClipboardHistory();
    })();
  }
  return initPromise;
}

/** 导入/恢复后从数据库重新加载各 store */
export async function reloadWorkhubData() {
  projectsStore.loaded = false;
  snippetsStore.loaded = false;
  favoritesStore.loaded = false;
  recentStore.loaded = false;
  clipboardStore.loaded = false;
  await loadProjects();
  await loadSnippets();
  await loadFavorites();
  await loadRecents();
  await loadClipboardHistory();
}