<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import WhIcon from "@/components/workhub/WhIcon.vue";
import ToolRunner from "@/components/workhub/tools/ToolRunner.vue";
import { setStatusHint } from "@/lib/workhub/status";
import {
  handleListArrowDown,
  handleListArrowUp,
  scrollListSelection,
} from "@/lib/workhub/listScroll";
import {
  TOOLS,
  getTool,
  searchTools,
  toolDesc,
  toolName,
} from "@/lib/workhub/tools/registry";
import { activeToolId, closeTool, openTool } from "@/lib/workhub/tools/toolHost";
import type { ToolDefinition } from "@/lib/workhub/tools/types";

const { t } = useI18n();

const q = ref("");
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);

const activeTool = computed(() => getTool(activeToolId.value));

const filtered = computed(() => (q.value.trim() ? searchTools(q.value) : TOOLS));

watch(q, () => {
  sel.value = 0;
});

watch(
  () => filtered.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

watch(sel, (index) => {
  if (activeTool.value) return;
  void scrollListSelection(listRef.value, index, undefined, filtered.value.length);
});

watch(activeTool, (tool) => {
  if (tool) q.value = "";
  else sel.value = 0;
});

function activateTool(tool: ToolDefinition) {
  openTool(tool.id);
}

function onKey(e: KeyboardEvent) {
  if (activeTool.value) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeTool();
    }
    return;
  }
  if (filtered.value.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) activateTool(cur);
  }
}

onMounted(() => {
  setStatusHint("tools.statusHint");
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <template v-if="activeTool">
      <div class="mb-4 flex items-center gap-2">
        <button
          type="button"
          class="text-caption text-text-secondary hover:text-text"
          @click="closeTool"
        >
          ← {{ t("tools.title") }}
        </button>
        <span class="text-caption text-text-placeholder">/</span>
        <span class="text-caption text-text-secondary">{{
          toolName(activeTool)
        }}</span>
      </div>
      <ToolRunner :tool="activeTool" />
    </template>

    <template v-else>
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-page-title">{{ t("tools.title") }}</h1>
      </div>

      <SearchBox
        v-model="q"
        :placeholder="t('tools.searchPlaceholder')"
        autofocus
      />

      <EmptyState
        v-if="filtered.length === 0"
        class="mt-4"
        :title="t('tools.noMatch')"
      />

      <div
        v-else
        ref="listRef"
        class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <div v-for="(tool, i) in filtered" :key="tool.id" :data-i="i">
          <button
            type="button"
            class="group relative flex min-h-[84px] w-full items-start gap-3.5 rounded-[var(--radius-lg)] border bg-surface p-4 text-left transition-all duration-150"
            :class="
              i === sel
                ? 'border-primary/40 bg-surface-active shadow-card'
                : 'border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card'
            "
            @click="sel = i"
            @dblclick="activateTool(tool)"
          >
            <span
              v-if="i === sel"
              class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-primary"
            />
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors"
              :style="{
                backgroundColor: tool.tint
                  ? `color-mix(in oklab, ${tool.tint} 14%, transparent)`
                  : 'var(--color-surface-hover)',
              }"
            >
              <WhIcon
                :name="(tool.icon as any)"
                :size="20"
                :style="tool.tint ? { color: tool.tint } : undefined"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-body font-medium transition-colors"
                :class="i === sel ? 'text-primary' : 'text-text group-hover:text-primary'"
              >
                {{ toolName(tool) }}
              </span>
              <span
                class="mt-1 line-clamp-2 text-caption leading-relaxed text-text-secondary"
              >
                {{ toolDesc(tool) }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
