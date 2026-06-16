import { reactive } from "vue";

export type ToastKind = "success" | "info" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

// 全局 Toast 队列（底部状态栏上方居中，2.5s 自动消失）
export const toastState = reactive<{ items: ToastItem[] }>({ items: [] });

let seq = 1;

function push(kind: ToastKind, text: string) {
  const id = seq++;
  toastState.items.push({ id, kind, text });
  setTimeout(() => {
    const idx = toastState.items.findIndex((i) => i.id === id);
    if (idx >= 0) toastState.items.splice(idx, 1);
  }, 2500);
}

export const toast = {
  success: (text: string) => push("success", text),
  info: (text: string) => push("info", text),
  error: (text: string) => push("error", text),
};
