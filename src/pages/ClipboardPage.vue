<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import { relTime, matchesSearch } from "@/lib/workhub/utils";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";
import { copyText } from "@/lib/workhub/actions";
import { toast } from "@/lib/workhub/toast";
import {
  CLIPBOARD_STACK_MAX,
  clearClipboardHistory,
  clipboardHistoryCount,
  clipboardStore,
  deleteClipboardEntry,
  sortClipboardEntries,
  toggleClipboardPin,
} from "@/lib/workhub/clipboardStore";
import type { ClipboardEntry } from "@/lib/workhub/types";
import { settingsStore } from "@/lib/workhub/settingsStore";

const { t } = useI18n();

const q = ref("");
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);
const clearing = ref(false);
const confirmClear = ref(false);

function matchesQuery(item: ClipboardEntry, k: string) {
  return matchesSearch(item.preview, k) || matchesSearch(item.content, k);
}

const filtered = computed(() => {
  const k = q.value.trim();
  const base = k
    ? clipboardStore.list.filter((c) => matchesQuery(c, k))
    : clipboardStore.list;
  return sortClipboardEntries(base);
});

const stackItems = computed(() => filtered.value.filter((c) => c.pinned));
const historyItems = computed(() => filtered.value.filter((c) => !c.pinned));
const searching = computed(() => !!q.value.trim());

watch(
  () => filtered.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

watch(sel, (index) => {
  void scrollListSelection(listRef.value, index, undefined, filtered.value.length);
});

function flatIndex(item: ClipboardEntry) {
  return filtered.value.findIndex((c) => c.id === item.id);
}

function subtitle(item: ClipboardEntry) {
  return item.content.length > 120
    ? `${item.content.slice(0, 120)}…`
    : item.content;
}

function activate(i: number) {
  const item = filtered.value[i];
  if (!item) return;
  void copyText(item.content, t("toast.clipboardCopied"), {
    kind: "clipboard",
    refId: item.id,
    title: item.preview,
  });
}

async function togglePin(item: ClipboardEntry) {
  try {
    const wasPinned = item.pinned;
    await toggleClipboardPin(item.id);
    toast.success(
      wasPinned ? t("clipboard.unpinned") : t("clipboard.pinned"),
    );
  } catch (e) {
    if (e instanceof Error && e.message === "CLIPBOARD_STACK_FULL") {
      toast.error(t("clipboard.stackFull", { n: CLIPBOARD_STACK_MAX }));
      return;
    }
    toast.error(t("clipboard.pinFailed"));
  }
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function onKey(e: KeyboardEvent) {
  if (clearing.value) return;
  if (filtered.value.length === 0) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    activate(sel.value);
  } else if (triggerListCopy(e, () => activate(sel.value))) {
    return;
  } else if (mod && e.key.toLowerCase() === "d" && !isEditable(e.target)) {
    e.preventDefault();
    const item = filtered.value[sel.value];
    if (item) void togglePin(item);
  } else if (e.key === "Delete" && !shouldBlockListDelete(e.target)) {
    e.preventDefault();
    const item = filtered.value[sel.value];
    if (item) void deleteOne(item.id);
  }
}

async function deleteOne(id: string) {
  try {
    await deleteClipboardEntry(id);
    toast.success(t("toast.deleted"));
  } catch {
    toast.error(t("clipboard.deleteFailed"));
  }
}

async function onConfirmClear() {
  confirmClear.value = false;
  if (clearing.value) return;
  clearing.value = true;
  try {
    await clearClipboardHistory();
    toast.success(t("clipboard.clearSuccess"));
  } catch {
    toast.error(t("clipboard.clearFailed"));
  } finally {
    clearing.value = false;
  }
}

onMounted(() => {
  setStatusHint("clipboard.statusHint");
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-page-title">{{ t("clipboard.titleHistory") }}</h1>
        <p class="mt-1 text-caption text-text-secondary">
          {{ t("clipboard.stackDesc", { n: CLIPBOARD_STACK_MAX }) }}
        </p>
      </div>
      <Button
        variant="secondary"
        :disabled="clearing || clipboardHistoryCount() === 0"
        @click="confirmClear = true"
      >
        {{ clearing ? t("clipboard.clearing") : t("clipboard.clearHistory") }}
      </Button>
    </div>

    <div v-if="!settingsStore.clipboardHistoryEnabled" class="mb-4">
      <EmptyState
        :title="t('clipboard.historyDisabled')"
        :description="t('clipboard.historyDisabledDesc')"
      />
    </div>

    <template v-else>
      <div class="mb-4">
        <SearchBox
          v-model="q"
          :placeholder="t('clipboard.searchPlaceholder')"
        />
      </div>

      <div
        v-if="filtered.length === 0"
        class="rounded-[var(--radius-lg)] border border-border bg-surface p-8 shadow-card"
      >
        <EmptyState
          :title="searching ? t('clipboard.noMatch') : t('clipboard.empty')"
          :description="
            searching ? t('clipboard.noMatchDesc') : t('clipboard.emptyDesc')
          "
        />
      </div>

      <div
        v-else
        ref="listRef"
        class="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-card"
      >
        <section v-if="stackItems.length > 0">
          <div class="mb-1.5 flex items-center justify-between px-1">
            <h2 class="text-section">{{ t("clipboard.stackTitle") }}</h2>
            <span class="text-caption text-text-secondary">
              {{ t("clipboard.stackCount", { n: stackItems.length, max: CLIPBOARD_STACK_MAX }) }}
            </span>
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="item in stackItems"
              :key="item.id"
              :data-i="flatIndex(item)"
            >
              <ResultItem
                kind="clipboard"
                :title="item.preview || t('clipboard.clipboardText')"
                :highlight="q.trim()"
                :badge="t('clipboard.stackBadge')"
                :subtitle="subtitle(item)"
                :meta="relTime(item.pinnedAt || item.createdAt)"
                :selected="flatIndex(item) === sel"
                @select="sel = flatIndex(item)"
                @activate="activate(flatIndex(item))"
              >
                <template #trailing>
                  <button
                    type="button"
                    class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                    @click.stop="togglePin(item)"
                  >
                    {{ t("clipboard.unpin") }}
                  </button>
                  <button
                    type="button"
                    class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                    @click.stop="deleteOne(item.id)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </template>
              </ResultItem>
            </div>
          </div>
        </section>

        <section v-if="historyItems.length > 0">
          <div v-if="stackItems.length > 0" class="mb-1.5 px-1">
            <h2 class="text-section">{{ t("clipboard.historyTitle") }}</h2>
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="item in historyItems"
              :key="item.id"
              :data-i="flatIndex(item)"
            >
              <ResultItem
                kind="clipboard"
                :title="item.preview || t('clipboard.clipboardText')"
                :highlight="q.trim()"
                :subtitle="subtitle(item)"
                :meta="relTime(item.createdAt)"
                :selected="flatIndex(item) === sel"
                @select="sel = flatIndex(item)"
                @activate="activate(flatIndex(item))"
              >
                <template #trailing>
                  <button
                    type="button"
                    class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                    @click.stop="togglePin(item)"
                  >
                    {{ t("clipboard.pin") }}
                  </button>
                  <button
                    type="button"
                    class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                    @click.stop="deleteOne(item.id)"
                  >
                    {{ t("common.delete") }}
                  </button>
                </template>
              </ResultItem>
            </div>
          </div>
        </section>

        <section
          v-else-if="stackItems.length > 0 && !searching"
          class="px-1 pb-1"
        >
          <p class="text-caption text-text-secondary">
            {{ t("clipboard.historyEmpty") }}
          </p>
        </section>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmClear"
      :title="t('clipboard.clearTitle')"
      :description="t('clipboard.clearDesc')"
      :confirm-text="t('clipboard.confirmClear')"
      @cancel="confirmClear = false"
      @confirm="onConfirmClear"
    />
  </div>
</template>
