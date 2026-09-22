<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import SearchBox from "@/components/workhub/SearchBox.vue";
import SearchResultsPanel from "@/components/workhub/SearchResultsPanel.vue";
import Toaster from "@/components/workhub/Toaster.vue";
import SnippetVariableDialog from "@/components/workhub/SnippetVariableDialog.vue";
import ToolRunner from "@/components/workhub/tools/ToolRunner.vue";
import { useGlobalSearch, type SearchRow } from "@/lib/workhub/useGlobalSearch";
import { activeToolId, closeTool } from "@/lib/workhub/tools/toolHost";
import { getTool, toolName } from "@/lib/workhub/tools/registry";
import { hideCurrentWindow } from "@/lib/workhub/windowActions";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { initWorkhubData, reloadWorkhubData } from "@/lib/workhub/init";
import { loadSettings, settingsStore } from "@/lib/workhub/settingsStore";
import { inTauri } from "@/lib/workhub/db";
import { snippetCopyState } from "@/lib/workhub/snippetCopy";
import { triggerListCopy } from "@/lib/workhub/listKeys";
import {
  refreshShellRuns,
  shellRunsStore,
  shellRunTitle,
  stopAllShellRuns,
  stopShellRun,
} from "@/lib/workhub/shellRuns";
import { toast } from "@/lib/workhub/toast";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const SEARCH_W = 480;
const SEARCH_H = 48;
const RESULTS_W = 560;
const RESULTS_H = 432;
const TOOL_W = 560;
const TOOL_H = 520;

const dataReady = ref(false);
const searchBox = ref<InstanceType<typeof SearchBox> | null>(null);
const listRef = ref<HTMLElement | null>(null);

const { q, debounced, searchScope, hasSearchInput, sel, hits, grouped, displayHits } = useGlobalSearch();

const activeTool = computed(() => getTool(activeToolId.value));
const showResults = computed(() => hasSearchInput.value && !activeTool.value);
const list = computed<SearchRow[]>(() => displayHits.value);

/* ---------- 后台命令：悬浮窗空闲时直接摊开，方便随手关掉 ---------- */
const runs = computed(() => shellRunsStore.list);
const runSel = ref(0);
const stoppingId = ref<string | null>(null);
const runsRef = ref<HTMLElement | null>(null);

const showRuns = computed(
  () =>
    dataReady.value &&
    !activeTool.value &&
    !hasSearchInput.value &&
    runs.value.length > 0,
);

watch(
  () => runs.value.length,
  (len) => {
    if (runSel.value >= len) runSel.value = Math.max(0, len - 1);
  },
);

async function stopRun(run: { id: string; pid: number }) {
  if (stoppingId.value) return;
  stoppingId.value = run.id;
  try {
    const stopped = await stopShellRun(run.id);
    if (stopped) {
      toast.success(
        t("workflow.background.stopped", { pid: String(run.pid) }),
      );
    } else {
      toast.error(t("workflow.background.stopFailed"));
    }
  } finally {
    stoppingId.value = null;
  }
}

async function stopEveryRun() {
  const count = await stopAllShellRuns();
  if (count > 0) {
    toast.success(t("workflow.background.allStopped", { n: String(count) }));
  } else {
    await refreshShellRuns();
  }
}

let unlistenFocus: (() => void) | undefined;
let unlistenWinFocus: (() => void) | undefined;

watch(
  () => list.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

watch(sel, (index) => {
  if (!showResults.value) return;
  void scrollListSelection(listRef.value, index, undefined, list.value.length);
});

async function focusSearch(selectAll = false) {
  if (!dataReady.value) return;
  await nextTick();
  searchBox.value?.focus({ selectAll });
  if (!selectAll) return;
  requestAnimationFrame(() => {
    searchBox.value?.focus({ selectAll: true });
  });
}

async function applySpotlightSize() {
  if (!inTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { LogicalSize } = await import("@tauri-apps/api/dpi");
  const win = getCurrentWindow();
  let size: InstanceType<typeof LogicalSize>;
  if (activeTool.value) size = new LogicalSize(TOOL_W, TOOL_H);
  else if (showResults.value) size = new LogicalSize(RESULTS_W, RESULTS_H);
  else if (showRuns.value)
    size = new LogicalSize(
      RESULTS_W,
      Math.min(440, SEARCH_H + 36 + runs.value.length * 32 + 18),
    );
  else size = new LogicalSize(SEARCH_W, SEARCH_H);
  await win.setSize(size);
  await win.center();
}

watch([showResults, activeTool, showRuns], () => {
  void applySpotlightSize();
});

function activate(row: SearchRow) {
  void runRowAction(row.action);
}

function copyRow(row: SearchRow) {
  void runRowAction(row.copy ?? row.action);
}

async function runRowAction(
  fn: (() => void | boolean | Promise<void | boolean>) | undefined,
) {
  if (!fn) return;
  const deferHide = await fn();
  if (deferHide) return;
  void hideCurrentWindow();
}

function onKey(e: KeyboardEvent) {
  if (snippetCopyState.open) return;
  // 后台命令面板显示时：↑↓ 选择、Enter 停止这一条
  if (showRuns.value) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleListArrowDown(runSel, runsRef.value, runs.value.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleListArrowUp(runSel, runsRef.value, runs.value.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cur = runs.value[runSel.value];
      if (cur) void stopRun(cur);
      return;
    }
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if (q.value) {
      q.value = "";
      return;
    }
    void hideCurrentWindow();
    return;
  }
  if (!showResults.value || list.value.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, list.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, list.value.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = list.value[sel.value];
    if (!cur) return;
    if (e.ctrlKey || e.metaKey) {
      cur.navigate?.();
    } else {
      activate(cur);
    }
  } else if (
    triggerListCopy(e, () => {
      const cur = list.value[sel.value];
      if (cur) copyRow(cur);
    })
  ) {
    return;
  }
}

async function refreshDataIfReady() {
  if (!dataReady.value) return;
  await reloadWorkhubData();
}

function backFromTool() {
  closeTool();
  void focusSearch(false);
}

function onWindowKey(e: KeyboardEvent) {
  if (snippetCopyState.open) return;
  if (e.key === "Escape" && activeTool.value) {
    e.preventDefault();
    backFromTool();
  }
}

async function bindFocusEvents() {
  if (!inTauri()) return;
  const { listen } = await import("@tauri-apps/api/event");
  unlistenFocus = await listen("workhub:focus-search", async () => {
    await refreshDataIfReady();
    await focusSearch(true);
  });
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  unlistenWinFocus = await getCurrentWindow().onFocusChanged(({ payload }) => {
    if (payload) {
      void refreshDataIfReady();
      void refreshShellRuns();
    }
  });
}

onMounted(() => {
  window.addEventListener("keydown", onWindowKey);
  void bindFocusEvents();
  void (async () => {
    await initWorkhubData();
    await loadSettings();
    void refreshShellRuns();
    dataReady.value = true;
    await nextTick();
    await applySpotlightSize();
    await focusSearch(false);
  })();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKey);
  unlistenFocus?.();
  unlistenWinFocus?.();
});
</script>

<template>
  <div
    class="flex h-screen w-screen flex-col overflow-hidden rounded-[var(--radius-lg)] bg-bg text-text"
    tabindex="-1"
  >
    <template v-if="activeTool">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2"
        >
          <button
            type="button"
            class="shrink-0 text-caption text-text-secondary hover:text-text"
            @mousedown.stop
            @click="backFromTool"
          >
            ← {{ t("common.search") }}
          </button>
          <span class="shrink-0 text-caption text-text-placeholder">/</span>
          <span class="min-w-0 truncate text-caption text-text-secondary">{{
            toolName(activeTool)
          }}</span>
          <div
            data-tauri-drag-region
            class="min-h-6 min-w-8 flex-1 self-stretch"
            aria-hidden="true"
          />
        </div>
        <div class="scroll-y min-h-0 flex-1 p-3">
          <ToolRunner :tool="activeTool" compact />
        </div>
      </div>
    </template>

    <template v-else>
      <div
        class="flex shrink-0 items-stretch gap-0 p-1"
        :class="showResults ? 'border-b border-border' : ''"
      >
        <div
          data-tauri-drag-region
          class="w-2 shrink-0 self-stretch"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <SearchBox
            v-if="dataReady"
            ref="searchBox"
            v-model="q"
            :placeholder="t('home.spotlightPlaceholder')"
            autofocus
            @keydown="onKey"
          />
          <div
            v-else
            class="flex h-10 items-center justify-center text-caption text-text-secondary"
          >
            {{ t("app.loadingShort") }}
          </div>
        </div>
        <div
          data-tauri-drag-region
          class="w-2 shrink-0 self-stretch"
          aria-hidden="true"
        />
      </div>
    </template>

    <div
      v-if="showRuns"
      ref="runsRef"
      class="scroll-y min-h-0 flex-1 px-2 pb-1"
    >
      <div class="flex items-center justify-between gap-3 px-1 py-1">
        <span class="text-caption text-text">
          {{ t("workflow.background.title") }}
          <span class="text-text-secondary">({{ runs.length }})</span>
        </span>
        <button
          type="button"
          class="h-6 shrink-0 rounded-[var(--radius-sm)] px-1.5 text-[10px] text-text-secondary hover:bg-surface-hover"
          @mousedown.stop
          @click="stopEveryRun"
        >
          {{ t("workflow.background.stopAll") }}
        </button>
      </div>
      <div
        v-for="(run, i) in runs"
        :key="run.id"
        :data-i="i"
        class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1"
        :class="i === runSel ? 'bg-surface-active' : 'hover:bg-surface-hover'"
        @mouseenter="runSel = i"
      >
        <span
          class="shrink-0 rounded-[var(--radius-sm)] px-1.5 text-[10px] leading-5"
          :class="run.background ? 'bg-success/10 text-success' : 'bg-surface-hover text-text-secondary'"
        >
          {{ run.background ? t("workflow.background.tagBackground") : t("workflow.background.tagForeground") }}
        </span>
        <span
          class="max-w-[42%] shrink-0 truncate text-caption text-text"
          :title="shellRunTitle(run)"
        >{{ shellRunTitle(run) }}</span>
        <span
          class="min-w-0 flex-1 truncate text-caption text-text-secondary"
          :title="run.command"
        >{{ run.command }}</span>
        <span class="shrink-0 text-[10px] text-text-secondary">
          {{ t("workflow.background.pid", { pid: String(run.pid) }) }}
        </span>
        <button
          type="button"
          class="h-6 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-danger hover:bg-danger/10 disabled:opacity-50"
          :disabled="stoppingId === run.id"
          @mousedown.stop
          @click.stop="stopRun(run)"
        >
          {{ t("workflow.background.stop") }}
        </button>
      </div>
      <p class="px-1 pt-1 text-[10px] text-text-secondary">
        {{ t("workflow.background.spotlightHint") }}
      </p>
    </div>

    <div
      v-if="showResults"
      ref="listRef"
      class="scroll-y min-h-0 flex-1 px-2 py-2"
    >
      <SearchResultsPanel
        compact
        :grouped="grouped"
        :hits="hits"
        :debounced="debounced"
        :search-scope="searchScope"
        :sel="sel"
        @update:sel="sel = $event"
        @activate="activate"
      />
    </div>

    <footer
      v-if="dataReady && showResults"
      class="shrink-0 bg-[color-mix(in_oklab,var(--color-surface-hover)_45%,transparent)] px-3 py-1 text-[10px] leading-snug text-text-secondary"
    >
      <div class="flex items-center justify-between gap-3 whitespace-nowrap">
        <span class="min-w-0 truncate">{{
          runs.length > 0
            ? t("home.spotlightRunsHint", { n: String(runs.length) })
            : t("home.spotlightStatusHint")
        }}</span>
        <span class="shrink-0 tabular-nums">{{
          t("home.spotlightHotkeySummon", { key: settingsStore.spotlightHotkey })
        }}</span>
      </div>
      <p
        class="mt-0.5 truncate whitespace-nowrap"
        :title="t('searchPrefix.prefixHint')"
      >
        {{ t("searchPrefix.prefixHint") }}
      </p>
    </footer>

    <Toaster />
    <SnippetVariableDialog />
  </div>
</template>
