<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import WhIcon from "./WhIcon.vue";
import AppLogo from "./AppLogo.vue";
import Toaster from "./Toaster.vue";
import SnippetVariableDialog from "./SnippetVariableDialog.vue";
import EmptyState from "./EmptyState.vue";
import HomePage from "@/pages/HomePage.vue";
import ProjectsPage from "@/pages/ProjectsPage.vue";
import ProjectDetailPage from "@/pages/ProjectDetailPage.vue";
import SnippetsPage from "@/pages/SnippetsPage.vue";
import SnippetDetailPage from "@/pages/SnippetDetailPage.vue";
import FavoritesPage from "@/pages/FavoritesPage.vue";
import ClipboardPage from "@/pages/ClipboardPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import { currentPath, navigate } from "@/lib/workhub/nav";
import { statusHintKey } from "@/lib/workhub/status";
import { initTheme } from "@/lib/workhub/theme";
import { initWorkhubData } from "@/lib/workhub/init";
import { applyDesktopPreferences, loadSettings, settingsStore } from "@/lib/workhub/settingsStore";
import { inTauri } from "@/lib/workhub/db";
import { getAppVersion, appUpdateStore, refreshAppUpdateStatus } from "@/lib/workhub/appUpdate";

type IconName = "home" | "project" | "snippet" | "star" | "link" | "settings" | "clipboard";

interface NavItem {
  to: string;
  label: string;
  hotkey: string;
  icon: IconName;
}

const { t, locale } = useI18n();

const footerHint = computed(() => {
  void locale.value;
  return t(statusHintKey.value);
});

// 左侧导航，对应 Ctrl+1~6（规范 §3）
const NAV = computed<NavItem[]>(() => [
  { to: "/", label: t("nav.home"), hotkey: "Ctrl+1", icon: "home" },
  { to: "/projects", label: t("nav.projects"), hotkey: "Ctrl+2", icon: "project" },
  { to: "/snippets", label: t("nav.snippets"), hotkey: "Ctrl+3", icon: "snippet" },
  { to: "/favorites", label: t("nav.favorites"), hotkey: "Ctrl+4", icon: "link" },
  { to: "/settings", label: t("nav.settings"), hotkey: "Ctrl+5", icon: "settings" },
  { to: "/clipboard", label: t("nav.clipboard"), hotkey: "Ctrl+6", icon: "clipboard" },
]);

const NAV_TINT: Partial<Record<IconName, string>> = {
  home: "#3370FF",
  project: "#3370FF",
  snippet: "#D99100",
  star: "#D99100",
  link: "#3370FF",
  clipboard: "#646A73",
};

function isActive(to: string) {
  return to === "/"
    ? currentPath.value === "/"
    : currentPath.value.startsWith(to);
}

const currentLabel = computed(
  () => NAV.value.find((n) => isActive(n.to))?.label ?? "",
);

// 项目详情路由参数：/projects/:id
const projectDetailId = computed(() => {
  const prefix = "/projects/";
  return currentPath.value.startsWith(prefix)
    ? currentPath.value.slice(prefix.length)
    : "";
});

// 片段详情路由参数：/snippets/:id
const snippetDetailId = computed(() => {
  const prefix = "/snippets/";
  return currentPath.value.startsWith(prefix)
    ? currentPath.value.slice(prefix.length)
    : "";
});

const dataReady = ref(false);
const appVersion = ref("");
const isDesktop = inTauri();

const footerVersion = computed(() =>
  appVersion.value ? t("app.footerVersion", { version: appVersion.value }) : "WorkHub",
);

// 全局快捷键：Ctrl+1~6 切换模块；Ctrl+, 设置；Alt+Z / Alt+X 由 Rust 全局注册；Esc 隐藏到托盘
function onWindowKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && !e.altKey) {
    const idx = ["1", "2", "3", "4", "5", "6"].indexOf(e.key);
    if (idx >= 0) {
      e.preventDefault();
      navigate(NAV.value[idx].to);
      return;
    }
    if (e.key === ",") {
      e.preventDefault();
      navigate("/settings");
      return;
    }
  }

  // Esc：弹窗/详情页自行处理；其余页面隐藏到托盘
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const p = currentPath.value;
  if (p.startsWith("/projects/") || p.startsWith("/snippets/")) return;

  e.preventDefault();
  void hideToTray();
}

function focusSearch() {
  navigate("/");
  window.dispatchEvent(new CustomEvent("workhub:focus-search"));
}

async function hideToTray() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("window_hide");
}

function stopWindowButton(e: MouseEvent) {
  e.stopPropagation();
}

async function bindGlobalTauriEvents() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("workhub:focus-search", focusSearch);
  await listen<string>("workhub:navigate", (e) => {
    if (e.payload) navigate(e.payload);
  });
}

onMounted(() => {
  initTheme();
  void getAppVersion().then((v) => {
    appVersion.value = v;
  });
  void (async () => {
    await initWorkhubData();
    await loadSettings();
    await applyDesktopPreferences();
    dataReady.value = true;
    void refreshAppUpdateStatus();
  })();
  void bindGlobalTauriEvents();
  window.addEventListener("keydown", onWindowKey);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKey);
});
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-bg text-text">
    <!-- 自定义标题栏（可拖拽，替代原生窗口装饰） -->
    <header
      data-tauri-drag-region
      class="flex h-14 shrink-0 select-none items-center justify-between border-b border-border bg-surface pl-5 pr-0"
    >
      <div data-tauri-drag-region class="flex min-w-0 flex-1 items-center gap-2">
        <AppLogo :size="28" img-class="shrink-0" />
        <span class="text-section text-text">WorkHub</span>
        <!-- <span class="ml-1 hidden text-caption text-text-secondary sm:inline">
          {{ t("app.tagline") }}
        </span> -->
      </div>
      <div class="flex shrink-0 items-center gap-2 pr-3">
        <kbd
          data-tauri-drag-region
          class="hidden text-mono items-center gap-1 rounded-[var(--radius-sm)] bg-surface-hover px-2 py-1 text-caption text-text-secondary md:inline-flex"
        >
          {{ settingsStore.mainHotkey }} {{ t("app.hotkeyMain") }} ·
          {{ settingsStore.spotlightHotkey }} {{ t("app.hotkeySpotlight") }}
        </kbd>
        <div v-if="isDesktop" class="ml-1 flex items-center">
          <button
            type="button"
            :aria-label="t('app.minimizeToTray')"
            class="inline-flex h-9 w-10 items-center justify-center text-text-secondary hover:bg-surface-hover"
            @mousedown="stopWindowButton"
            @click="hideToTray"
          >
            <span class="text-lg leading-none">—</span>
          </button>
          <button
            type="button"
            :aria-label="t('app.closeToTray')"
            class="inline-flex h-9 w-10 items-center justify-center text-text-secondary hover:bg-danger/10 hover:text-danger"
            @mousedown="stopWindowButton"
            @click="hideToTray"
          >
            <span class="text-lg leading-none">×</span>
          </button>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- 左侧导航 72px（英文标签略长，预留宽度 + 截断） -->
      <nav
        :aria-label="t('app.mainNav')"
        class="flex w-[72px] shrink-0 flex-col gap-1 border-r border-border bg-surface py-3"
      >
        <button
          v-for="item in NAV"
          :key="item.to"
          type="button"
          :title="`${item.label} (${item.hotkey})`"
          :aria-label="`${item.label} ${item.hotkey}`"
          class="relative mx-1 flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[var(--radius-md)] transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-surface-active text-primary'
              : 'text-text-secondary hover:bg-surface-hover'
          "
          @click="navigate(item.to)"
        >
          <span
            v-if="isActive(item.to)"
            class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-primary"
          />
          <WhIcon
            :name="item.icon"
            :size="20"
            class="shrink-0"
            :style="
              !isActive(item.to) && NAV_TINT[item.icon]
                ? { color: NAV_TINT[item.icon] }
                : undefined
            "
          />
          <span
            v-if="item.to === '/settings' && appUpdateStore.status === 'available'"
            class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
            :aria-label="t('settings.updateAvailableNav')"
          />
          <span
            class="self-stretch min-w-0 truncate px-0.5 text-center text-[10px] leading-none"
          >{{ item.label }}</span>
        </button>
      </nav>

      <!-- 主区：唯一滚动容器 -->
      <main class="scroll-y min-w-0 flex-1">
        <div
          v-if="!isDesktop"
          class="border-b border-warning/30 bg-[color-mix(in_oklab,var(--color-warning)_12%,transparent)] px-6 py-2 text-caption text-text-secondary"
        >
          {{ t("app.browserPreview", { cmd: "npm run tauri dev" }) }}
        </div>
        <div class="mx-auto max-w-[1080px] px-6 py-5">
          <div
            v-if="!dataReady"
            class="flex items-center justify-center py-16 text-body text-text-secondary"
          >
            {{ t("app.loading") }}
          </div>
          <template v-else>
            <HomePage v-if="currentPath === '/'" />
            <ProjectsPage v-else-if="currentPath === '/projects'" />
            <ProjectDetailPage
              v-else-if="projectDetailId"
              :id="projectDetailId"
            />
            <SnippetsPage v-else-if="currentPath === '/snippets'" />
            <SnippetDetailPage
              v-else-if="snippetDetailId"
              :id="snippetDetailId"
            />
            <FavoritesPage v-else-if="currentPath === '/favorites'" />
            <ClipboardPage v-else-if="currentPath === '/clipboard'" />
            <SettingsPage v-else-if="currentPath === '/settings'" />
            <EmptyState
              v-else
              :title="t('app.moduleBuilding', { name: currentLabel })"
              :description="t('app.moduleBuildingDesc')"
            />
          </template>
        </div>
      </main>
    </div>

    <!-- 底部状态栏 32px -->
    <footer
      class="flex h-8 shrink-0 items-center justify-between border-t border-border bg-surface px-4 text-caption text-text-secondary"
    >
      <span>{{ footerHint }}</span>
      <span>{{ footerVersion }}</span>
    </footer>

    <Toaster />
    <SnippetVariableDialog />
  </div>
</template>
