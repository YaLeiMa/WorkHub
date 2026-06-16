import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const platform = process.env.TAURI_ENV_PLATFORM;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), vue()],

  // 打包后由 Tauri 内置协议加载页面，必须用相对路径，否则 /assets/* 会 404 导致白屏
  base: "./",

  envPrefix: ["VITE_", "TAURI_ENV_"],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@fontsource": fileURLToPath(
        new URL("./node_modules/@fontsource", import.meta.url),
      ),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1487,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    // 与 Tauri WebView2 / WKWebView 能力对齐，避免生产包语法不兼容
    target: platform === "windows" ? "chrome105" : "safari13",
    // @ts-expect-error process is a nodejs global
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    // @ts-expect-error process is a nodejs global
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
