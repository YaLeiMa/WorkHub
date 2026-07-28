<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import { relTime } from "@/lib/workhub/utils";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import { toast } from "@/lib/workhub/toast";
import { requestWorkflowRun } from "@/lib/workhub/workflowRunPrompt";
import {
  deleteWorkflow,
  toggleWorkflowFavorite,
  workflowsStore,
} from "@/lib/workhub/workflowsStore";
import { getProject } from "@/lib/workhub/projectsStore";
import type { Workflow } from "@/lib/workhub/types";

const { t } = useI18n();

const q = ref("");
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);
const deletingId = ref<string | null>(null);
const runningId = ref<string | null>(null);

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase();
  const list = [...workflowsStore.list].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt,
  );
  if (!k) return list;
  return list.filter(
    (w) =>
      w.title.toLowerCase().includes(k) ||
      w.description.toLowerCase().includes(k) ||
      w.tags.some((tag) => tag.toLowerCase().includes(k)),
  );
});

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
  void scrollListSelection(listRef.value, index, undefined, filtered.value.length);
});

function subtitle(w: Workflow) {
  const parts = [t("workflow.stepsCount", { n: w.steps.length })];
  if (w.hotkey) parts.unshift(w.hotkey);
  const project = w.projectId ? getProject(w.projectId) : undefined;
  if (project) parts.unshift(project.name);
  if (w.description) parts.push(w.description);
  return parts.join(" · ");
}

async function execute(w: Workflow) {
  if (runningId.value) return;
  runningId.value = w.id;
  try {
    await requestWorkflowRun(w);
  } catch {
    toast.error(t("workflow.errors.runFailed"));
  } finally {
    runningId.value = null;
  }
}

function onKey(e: KeyboardEvent) {
  if (deletingId.value) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) void execute(cur);
  } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) navigate(`/workflows/${cur.id}`);
  } else if (e.key === "Delete" && !shouldBlockListDelete(e.target)) {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) deletingId.value = cur.id;
  }
}

async function confirmDelete() {
  if (!deletingId.value) return;
  await deleteWorkflow(deletingId.value);
  deletingId.value = null;
  toast.success(t("workflow.deleted"));
}

onMounted(() => {
  setStatusHint("workflow.list.statusHint");
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-title text-text">{{ t("workflow.title") }}</h1>
        <p class="mt-1 text-caption text-text-secondary">{{ t("workflow.subtitle") }}</p>
      </div>
      <div>
        <Button @click="navigate('/workflows/new')">
          {{ t("workflow.add") }}
        </Button>
      </div>
    </div>

    <SearchBox v-model="q" :placeholder="t('workflow.searchPlaceholder')" />

    <div v-if="filtered.length === 0" class="py-8">
      <EmptyState
        :title="q ? t('workflow.noMatch') : t('workflow.empty')"
        :description="q ? undefined : t('workflow.emptyDesc')"
      />
    </div>

    <div v-else ref="listRef" class="flex flex-col gap-1">
      <div v-for="(w, i) in filtered" :key="w.id" :data-i="i">
        <ResultItem
          kind="workflow"
          :title="w.title"
          :highlight="q"
          :subtitle="subtitle(w)"
          :tags="w.tags"
          :meta="relTime(w.updatedAt)"
          :selected="i === sel"
          :favorite="w.favorite"
          show-favorite
          @select="sel = i"
          @activate="execute(w)"
          @toggle-favorite="toggleWorkflowFavorite(w.id)"
        >
          <template #trailing>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="navigate(`/workflows/${w.id}`)"
            >
              {{ t("common.edit") }}
            </button>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="deletingId = w.id"
            >
              {{ t("common.delete") }}
            </button>
          </template>
        </ResultItem>
      </div>
    </div>

    <ConfirmDialog
      :open="!!deletingId"
      :title="t('workflow.deleteConfirm')"
      @confirm="confirmDelete"
      @cancel="deletingId = null"
    />
  </div>
</template>
