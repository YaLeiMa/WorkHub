import { ref } from "vue";

export type Theme = "system" | "light" | "dark";

const KEY = "workhub-theme";

function load(): Theme {
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem(KEY) as Theme) || "system";
}

export const theme = ref<Theme>(load());

// 依据主题与系统偏好切换 <html> 的 .dark 类
function apply(t: Theme) {
  if (typeof document === "undefined") return;
  const dark =
    t === "dark" ||
    (t === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(t: Theme) {
  theme.value = t;
  localStorage.setItem(KEY, t);
  apply(t);
}

export function initTheme() {
  apply(theme.value);
  if (typeof window !== "undefined") {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        // 仅在「跟随系统」时随系统切换
        if (theme.value === "system") apply("system");
      });
  }
}
