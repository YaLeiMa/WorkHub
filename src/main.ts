import { createApp } from "vue";
import "./fonts.css";
import "./style.css";
import App from "./App.vue";
import { i18n, setAppLocale } from "./i18n";

setAppLocale(i18n.global.locale.value as "zh-CN" | "en");

const app = createApp(App);
app.use(i18n);
app.config.errorHandler = (err) => {
  console.error("[WorkHub]", err);
};
window.addEventListener("unhandledrejection", (e) => {
  console.error("[WorkHub] unhandled rejection", e.reason);
});
app.mount("#app");
