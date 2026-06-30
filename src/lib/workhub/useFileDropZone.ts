import { onMounted, onUnmounted, watch, type Ref } from "vue";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { inTauri } from "./db";

export interface FileDropZoneOptions {
  /** 为 false 时不响应拖放 */
  enabled?: () => boolean;
  onHoverChange?: (over: boolean) => void;
  onFiles?: (files: File[]) => void;
  onPaths?: (paths: string[]) => void;
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Tauri 物理坐标 → 与 getBoundingClientRect 一致的逻辑坐标 */
function toLogicalPoint(x: number, y: number): { x: number; y: number } {
  const scale = window.devicePixelRatio || 1;
  return { x: x / scale, y: y / scale };
}

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
]);

export function isImagePath(path: string): boolean {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return IMAGE_EXT.has(base.slice(dot + 1).toLowerCase());
}

/**
 * 文件拖放区：浏览器用 HTML5 DnD；Tauri 桌面端用 onDragDropEvent（与 HTML5 互斥）。
 */
export function useFileDropZone(
  zoneRef: Ref<HTMLElement | null>,
  options: FileDropZoneOptions,
) {
  let unlistenTauri: (() => void) | null = null;
  let unbindHtml: (() => void) | null = null;
  let htmlDepth = 0;

  function isEnabled() {
    return options.enabled?.() !== false;
  }

  function hitTest(physX: number, physY: number): boolean {
    const el = zoneRef.value;
    if (!el) return false;
    const { x, y } = toLogicalPoint(physX, physY);
    return pointInRect(x, y, el.getBoundingClientRect());
  }

  async function bindTauri() {
    if (!inTauri() || unlistenTauri) return;
    const webview = getCurrentWebview();
    unlistenTauri = await webview.onDragDropEvent((event) => {
      if (!isEnabled()) return;
      const { payload } = event;
      if (payload.type === "enter" || payload.type === "over") {
        options.onHoverChange?.(
          hitTest(payload.position.x, payload.position.y),
        );
      } else if (payload.type === "leave") {
        options.onHoverChange?.(false);
      } else if (payload.type === "drop") {
        const over = hitTest(payload.position.x, payload.position.y);
        options.onHoverChange?.(false);
        if (over && payload.paths.length) options.onPaths?.(payload.paths);
      }
    });
  }

  function bindHtml(el: HTMLElement) {
    const onEnter = (e: DragEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      htmlDepth += 1;
      options.onHoverChange?.(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      htmlDepth = Math.max(0, htmlDepth - 1);
      if (htmlDepth === 0) options.onHoverChange?.(false);
    };
    const onOver = (e: DragEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      htmlDepth = 0;
      options.onHoverChange?.(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) options.onFiles?.(files);
    };
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("dragover", onOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("drop", onDrop);
    };
  }

  function syncHtmlBinding() {
    unbindHtml?.();
    unbindHtml = null;
    if (inTauri()) return;
    const el = zoneRef.value;
    if (!el) return;
    unbindHtml = bindHtml(el);
  }

  onMounted(() => {
    void bindTauri();
    syncHtmlBinding();
  });

  watch(zoneRef, () => syncHtmlBinding());

  onUnmounted(() => {
    unlistenTauri?.();
    unlistenTauri = null;
    unbindHtml?.();
    unbindHtml = null;
  });
}
