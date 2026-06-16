<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import SpotlightPage from "@/pages/SpotlightPage.vue";
import { bindLocaleSync } from "@/i18n";
import { initTheme } from "@/lib/workhub/theme";
import { setWindowLabel } from "@/lib/workhub/windowActions";
import { inTauri } from "@/lib/workhub/db";
import { loadSettings } from "@/lib/workhub/settingsStore";

const { t, locale } = useI18n();

let unbindLocale: (() => void) | undefined;

async function applyWindowTitle() {
  if (!inTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTitle(t("app.windowTitleSpotlight"));
  } catch {
    /* ACL 未配置时忽略，避免阻塞启动 */
  }
}

onMounted(async () => {
  setWindowLabel("spotlight");
  initTheme();
  await loadSettings();
  unbindLocale = await bindLocaleSync();
  await applyWindowTitle();
  if (inTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    document.documentElement.classList.add("spotlight-window");
    try {
      await getCurrentWindow().setDecorations(false);
    } catch {
      /* 同上 */
    }
  }
});

watch(locale, () => {
  void applyWindowTitle();
});

onUnmounted(() => {
  unbindLocale?.();
});
</script>

<template>
  <SpotlightPage />
</template>
