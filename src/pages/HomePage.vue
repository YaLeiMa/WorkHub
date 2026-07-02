<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import { projectsStore } from "@/lib/workhub/projectsStore";
import { snippetsStore } from "@/lib/workhub/snippetsStore";
import { favoritesStore } from "@/lib/workhub/favoritesStore";
import {
  clearRecents,
  deleteRecent,
  recentStore,
} from "@/lib/workhub/recentStore";
import { toast } from "@/lib/workhub/toast";
import type { RecentEntry } from "@/lib/workhub/types";
import { relTime } from "@/lib/workhub/utils";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import { copyText, openFile, openProject, openUrl } from "@/lib/workhub/actions";
import { requestSnippetCopy, snippetCopyState } from "@/lib/workhub/snippetCopy";
import {
  snippetListGlyph,
  snippetListSwatch,
  snippetSubtitle,
} from "@/lib/workhub/snippetDisplay";
import { useGlobalSearch, type SearchRow } from "@/lib/workhub/useGlobalSearch";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import SearchResultsPanel from "@/components/workhub/SearchResultsPanel.vue";
import { useI18n } from "vue-i18n";
import { t } from "@/i18n";

type Row = SearchRow;
const searchBox = ref<InstanceType<typeof SearchBox> | null>(null);
const listRef = ref<HTMLElement | null>(null);
const deletingId = ref<string | null>(null);
const clearing = ref(false);

const { t: $t } = useI18n();
const {
  q,
  debounced,
  searchScope,
  hasSearchInput,
  sel,
  hits,
  grouped,
  displayHits,
} = useGlobalSearch();

function findProjectIdBySubItem(
  kind: "link" | "command" | "doc",
  refId: string,
): string | undefined {
  for (const p of projectsStore.list) {
    if (kind === "link" && p.links.some((l) => l.id === refId)) return p.id;
    if (kind === "command" && p.commands.some((c) => c.id === refId)) return p.id;
    if (kind === "doc" && p.docs.some((d) => d.id === refId)) return p.id;
  }
  return undefined;
}

/** 最近使用项跳转详情（Ctrl+Enter） */
function navigateForRecent(r: RecentEntry): (() => void) | undefined {
  if (r.kind === "project") {
    return () => navigate(`/projects/${r.refId}`);
  }
  if (r.kind === "snippet") {
    return () => navigate(`/snippets/${r.refId}`);
  }
  if (r.kind === "clipboard") {
    return () => navigate("/clipboard");
  }
  if (r.kind === "file" || r.kind === "folder") {
    return () => navigate("/favorites");
  }
  if (r.kind === "link" || r.kind === "command" || r.kind === "doc") {
    if (favoritesStore.list.some((f) => f.id === r.refId)) {
      return () => navigate("/favorites");
    }
    const projectId = findProjectIdBySubItem(r.kind, r.refId);
    if (projectId) return () => navigate(`/projects/${projectId}`);
  }
  return undefined;
}

// 根据最近记录解析主操作（优先从 store 取最新数据，否则用快照字段）
function actionForRecent(r: RecentEntry): () => void {
  const meta = {
    kind: r.kind,
    refId: r.refId,
    title: r.title,
    subtitle: r.subtitle,
  };
  return () => {
    if (r.kind === "project") {
      const p = projectsStore.list.find((x) => x.id === r.refId);
      openProject(p?.path ?? r.subtitle ?? r.title, p?.name ?? r.title, meta);
    } else if (r.kind === "snippet") {
      const s = snippetsStore.list.find((x) => x.id === r.refId);
      if (s) requestSnippetCopy(s, meta);
    } else if (r.kind === "command") {
      const c = projectsStore.list
        .flatMap((p) => p.commands)
        .find((x) => x.id === r.refId);
      if (c)
        copyText(c.command, t("toast.commandCopied"), {
          kind: "command",
          refId: c.id,
          title: c.title,
          subtitle: c.command,
        });
    } else if (r.kind === "link") {
      const f = favoritesStore.list.find((x) => x.id === r.refId);
      if (f) {
        openUrl(f.target, {
          kind: r.kind,
          refId: r.refId,
          title: r.title,
          subtitle: f.target,
        });
      } else {
        const link = projectsStore.list
          .flatMap((p) => p.links)
          .find((x) => x.id === r.refId);
        openUrl(link?.url ?? r.subtitle ?? "", {
          kind: r.kind,
          refId: r.refId,
          title: r.title,
          subtitle: link?.url ?? r.subtitle,
        });
      }
    } else if (r.kind === "doc") {
      const f = favoritesStore.list.find((x) => x.id === r.refId);
      if (f) {
        openUrl(f.target, {
          kind: r.kind,
          refId: r.refId,
          title: r.title,
          subtitle: f.target,
        });
      } else {
        openFile(r.subtitle ?? r.title, t("toast.opened"), {
          kind: r.kind,
          refId: r.refId,
          title: r.title,
          subtitle: r.subtitle,
        });
      }
    } else {
      const f = favoritesStore.list.find((x) => x.id === r.refId);
      openFile(f?.target ?? r.subtitle ?? r.title, t("toast.opened"), {
        kind: r.kind,
        refId: r.refId,
        title: r.title,
        subtitle: f?.target ?? r.subtitle,
      });
    }
  };
}

function copyForRecent(r: RecentEntry): () => void {
  const meta = {
    kind: r.kind,
    refId: r.refId,
    title: r.title,
    subtitle: r.subtitle,
  };
  return () => {
    if (r.kind === "project") {
      const p = projectsStore.list.find((x) => x.id === r.refId);
      void copyText(p?.path ?? r.subtitle ?? "", t("toast.copied"), meta);
    } else if (r.kind === "snippet") {
      const s = snippetsStore.list.find((x) => x.id === r.refId);
      if (s) requestSnippetCopy(s, meta);
    } else if (r.kind === "command") {
      const c = projectsStore.list
        .flatMap((p) => p.commands)
        .find((x) => x.id === r.refId);
      void copyText(
        c?.command ?? r.subtitle ?? "",
        t("toast.commandCopied"),
        c
          ? { kind: "command", refId: c.id, title: c.title, subtitle: c.command }
          : meta,
      );
    } else if (r.kind === "link") {
      const f = favoritesStore.list.find((x) => x.id === r.refId);
      if (f) {
        void copyText(f.target, t("toast.copied"), meta);
        return;
      }
      const link = projectsStore.list
        .flatMap((p) => p.links)
        .find((x) => x.id === r.refId);
      void copyText(link?.url ?? r.subtitle ?? "", t("toast.copied"), meta);
    } else {
      const f = favoritesStore.list.find((x) => x.id === r.refId);
      void copyText(f?.target ?? r.subtitle ?? "", t("toast.copied"), meta);
    }
  };
}

// 无输入时：最近使用（10 条，来自 SQLite / 内存 store）
const flatRecent = computed<Row[]>(() =>
  recentStore.list.slice(0, 10).map((r) => {
    const snippet =
      r.kind === "snippet" ? snippetsStore.list.find((s) => s.id === r.refId) : undefined;
    const swatch = snippet ? snippetListSwatch(snippet) : undefined;
    const glyph = snippet ? snippetListGlyph(snippet) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      badge: snippet?.category,
      subtitle: snippet ? snippetSubtitle(snippet) : r.subtitle,
      swatchHex: swatch,
      glyph,
      updatedAt: r.at,
      action: actionForRecent(r),
      copy: copyForRecent(r),
      navigate: navigateForRecent(r),
    };
  }),
);

// 当前用于键盘导航的扁平列表（与展示顺序一致）
const list = computed<Row[]>(() => {
  if (!hasSearchInput.value) return flatRecent.value;
  if (!debounced.value && searchScope.value !== "clipboard") return [];
  return displayHits.value;
});

// 列表长度变化时收敛选中项，避免越界
watch(
  () => list.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

// 选中项滚动到可见区域
watch(sel, (index) => {
  void scrollListSelection(listRef.value, index, undefined, list.value.length);
});

function onKey(e: KeyboardEvent) {
  if (deletingId.value || clearing.value || snippetCopyState.open) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, list.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, list.value.length);
  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    list.value[sel.value]?.navigate?.();
  } else if (e.key === "Enter") {
    e.preventDefault();
    list.value[sel.value]?.action();
  } else if (
    triggerListCopy(e, () => {
      const row = list.value[sel.value];
      (row?.copy ?? row?.action)?.();
    })
  ) {
    return;
  } else if (
    !hasSearchInput.value &&
    e.key === "Delete" &&
    !shouldBlockListDelete(e.target)
  ) {
    e.preventDefault();
    const cur = flatRecent.value[sel.value];
    if (cur) deletingId.value = cur.id;
  }
}

async function confirmDeleteRecent() {
  if (!deletingId.value) return;
  try {
    await deleteRecent(deletingId.value);
    toast.success(t("toast.removed"));
  } catch {
    toast.error(t("toast.removeFailed"));
  }
  deletingId.value = null;
}

async function confirmClearRecents() {
  try {
    await clearRecents();
    toast.success(t("toast.recentCleared"));
  } catch {
    toast.error(t("toast.clearFailed"));
  }
  clearing.value = false;
}

// Alt+Z 唤起完整窗口（Rust 全局快捷键 → Shell 派发 focus 事件）
function focusSearch() {
  searchBox.value?.focus({ selectAll: true });
}

onMounted(() => {
  setStatusHint("status.home");
  window.addEventListener("workhub:focus-search", focusSearch);
});

onUnmounted(() => {
  window.removeEventListener("workhub:focus-search", focusSearch);
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <h1 class="text-page-title mb-4">{{ $t("home.title") }}</h1>
    <SearchBox
      ref="searchBox"
      v-model="q"
      :placeholder="$t('home.searchPlaceholder')"
      autofocus
    />

    <div ref="listRef" class="mt-5">
      <!-- 无输入：最近使用 -->
      <template v-if="!hasSearchInput">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-section">{{ $t("home.recent") }}</h2>
          <button
            v-if="flatRecent.length > 0"
            type="button"
            class="text-caption text-text-secondary hover:text-danger"
            @click="clearing = true"
          >
            {{ $t("common.clear") }}
          </button>
        </div>
        <EmptyState
          v-if="flatRecent.length === 0"
          :title="$t('home.noRecent')"
          :description="$t('home.noRecentDesc')"
        >
          <template #action>
            <Button variant="primary" @click="navigate('/projects')">
              {{ $t("home.goAddProject") }}
            </Button>
          </template>
        </EmptyState>
        <div v-else class="flex flex-col gap-1">
          <div v-for="(r, i) in flatRecent" :key="r.id" :data-i="i">
            <ResultItem
              :kind="r.kind"
              :title="r.title"
              :badge="r.badge"
              :subtitle="r.subtitle"
              :swatch-hex="r.swatchHex"
              :glyph="r.glyph"
              :meta="relTime(r.updatedAt)"
              :selected="i === sel"
              @select="sel = i"
              @activate="r.action()"
            >
              <template #trailing>
                <button
                  v-if="r.navigate"
                  type="button"
                  class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                  @click.stop="r.navigate?.()"
                >
                  {{ $t("common.detail") }}
                </button>
                <button
                  type="button"
                  class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                  @click.stop="deletingId = r.id"
                >
                  {{ $t("common.delete") }}
                </button>
              </template>
            </ResultItem>
          </div>
        </div>
      </template>

      <!-- 有输入：分组结果（含前缀 @ # >） -->
      <SearchResultsPanel
        v-else
        :grouped="grouped"
        :hits="hits"
        :debounced="debounced"
        :search-scope="searchScope"
        :sel="sel"
        @update:sel="sel = $event"
        @activate="(row) => row.action()"
      />
    </div>

    <ConfirmDialog
      :open="!!deletingId"
      :title="$t('home.removeRecent')"
      :description="$t('home.removeRecentDesc')"
      :confirm-text="$t('common.delete')"
      @cancel="deletingId = null"
      @confirm="confirmDeleteRecent"
    />

    <ConfirmDialog
      :open="clearing"
      :title="$t('home.clearRecent')"
      :description="$t('home.clearRecentDesc')"
      :confirm-text="$t('common.clear')"
      @cancel="clearing = false"
      @confirm="confirmClearRecents"
    />
  </div>
</template>
