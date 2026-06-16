<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import WhIcon from "@/components/workhub/WhIcon.vue";
import Modal from "@/components/workhub/Modal.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import WhTextarea from "@/components/workhub/WhTextarea.vue";
import WhSelect from "@/components/workhub/WhSelect.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import HexColorInput from "@/components/workhub/HexColorInput.vue";
import SymbolPicker from "@/components/workhub/SymbolPicker.vue";
import { isColorSnippet, isValidHex, normalizeHex } from "@/lib/workhub/colorUtils";
import { requestSnippetCopy, snippetCopyState } from "@/lib/workhub/snippetCopy";
import {
  snippetListGlyph,
  snippetListSwatch,
  snippetSubtitle,
} from "@/lib/workhub/snippetDisplay";
import { isSymbolSnippet, isValidSymbol, normalizeSymbol } from "@/lib/workhub/symbolUtils";
import { relTime, matchesSearch } from "@/lib/workhub/utils";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import { snippetMatchesSearch } from "@/lib/workhub/snippetSearch";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import { toast } from "@/lib/workhub/toast";
import {
  SNIPPET_CATEGORIES,
  SNIPPET_FILTER_ALL,
  SNIPPET_FORM_CATEGORIES,
  snippetCategoryLabel,
} from "@/lib/workhub/labels";
import {
  createSnippet,
  deleteSnippet,
  openSnippetEditor,
  snippetsStore,
  toggleSnippetFavorite,
} from "@/lib/workhub/snippetsStore";
import type { Snippet, SnippetCategory } from "@/lib/workhub/types";

const { t } = useI18n();

const q = ref("");
const cat = ref<string>(SNIPPET_FILTER_ALL);
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);

const creating = ref(false);
const deletingId = ref<string | null>(null);

const fTitle = ref("");
const fCategory = ref<SnippetCategory>("shell");
const fLanguage = ref("");
const fTags = ref<string[]>([]);
const fCode = ref("");
const errTitle = ref("");
const errCode = ref("");
const tagInputRef = ref<{ flushDraft: () => void } | null>(null);

const isColorForm = computed(() => isColorSnippet(fCategory.value));
const isSymbolForm = computed(() => isSymbolSnippet(fCategory.value));
const isSpecialForm = computed(() => isColorForm.value || isSymbolForm.value);

const titlePlaceholder = computed(() => {
  if (isColorForm.value) return t("snippet.placeholderTitleColor");
  if (isSymbolForm.value) return t("snippet.placeholderTitleSymbol");
  return t("snippet.placeholderTitleDefault");
});

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase();
  return snippetsStore.list.filter((s) => {
    if (cat.value !== SNIPPET_FILTER_ALL && s.category !== cat.value) return false;
    if (!k) return true;
    return snippetMatchesSearch(s, (text) => matchesSearch(text, k), k, {
      includeCode: true,
    });
  });
});

watch([q, cat], () => {
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

watch(creating, (open) => {
  if (!open) return;
  fTitle.value = "";
  fCategory.value = "shell";
  fLanguage.value = "";
  fTags.value = [];
  fCode.value = "";
  errTitle.value = "";
  errCode.value = "";
});

watch(fCategory, (category) => {
  if (isColorSnippet(category) && !fCode.value.trim()) {
    fCode.value = "#409EFF";
  } else if (isSymbolSnippet(category) && !fCode.value.trim()) {
    fCode.value = "→";
  }
});

function onSymbolPick(payload: { symbol: string; title: string; tags: string[] }) {
  if (!fTitle.value.trim()) fTitle.value = payload.title;
  if (fTags.value.length === 0) fTags.value = [...payload.tags];
}

function closeForm() {
  creating.value = false;
}

async function submitForm() {
  tagInputRef.value?.flushDraft();

  errTitle.value = fTitle.value.trim() ? "" : t("snippet.errTitle");
  if (isColorForm.value) {
    errCode.value = isValidHex(fCode.value) ? "" : t("snippet.errColor");
  } else if (isSymbolForm.value) {
    errCode.value = isValidSymbol(fCode.value) ? "" : t("snippet.errSymbol");
  } else {
    errCode.value = fCode.value.trim() ? "" : t("snippet.errCode");
  }
  if (errTitle.value || errCode.value) return;

  const code = isColorForm.value
    ? (normalizeHex(fCode.value) ?? fCode.value.trim())
    : isSymbolForm.value
      ? (normalizeSymbol(fCode.value) ?? fCode.value.trim())
      : fCode.value;

  try {
    const s = await createSnippet({
      title: fTitle.value.trim(),
      category: fCategory.value,
      language: isSpecialForm.value ? "" : fLanguage.value.trim(),
      tags: [...fTags.value],
      code,
    });
    toast.success(t("snippet.created"));
    closeForm();
    navigate(`/snippets/${s.id}`);
  } catch {
    toast.error(t("snippet.createFailed"));
  }
}

async function confirmDelete() {
  if (!deletingId.value) return;
  try {
    await deleteSnippet(deletingId.value);
    toast.success(t("toast.deleted"));
  } catch {
    toast.error(t("toast.deleteFailed"));
  }
  deletingId.value = null;
}

function onKey(e: KeyboardEvent) {
  if (creating.value || deletingId.value || snippetCopyState.open) return;

  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter" && mod) {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) navigate(`/snippets/${cur.id}`);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur)
      requestSnippetCopy(cur, {
        kind: "snippet",
        refId: cur.id,
        title: cur.title,
        subtitle: cur.category,
      });
  } else if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) onToggleFav(cur);
  } else if (
    triggerListCopy(e, () => {
      const cur = filtered.value[sel.value];
      if (cur)
        requestSnippetCopy(cur, {
          kind: "snippet",
          refId: cur.id,
          title: cur.title,
          subtitle: cur.category,
        });
    })
  ) {
    return;
  } else if (e.key === "Delete" && !shouldBlockListDelete(e.target)) {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) deletingId.value = cur.id;
  }
}

function onToggleFav(s: Snippet) {
  const wasFav = s.favorite;
  toggleSnippetFavorite(s.id);
  toast.success(wasFav ? t("toast.unfavorited") : t("toast.favorited"));
}

onMounted(() => {
  setStatusHint("status.snippets");
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-page-title">{{ t("snippet.title") }}</h1>
      <Button variant="primary" @click="creating = true">
        <WhIcon name="plus" :size="16" /> {{ t("snippet.addShort") }}
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <div class="flex-1">
        <SearchBox
          v-model="q"
          :placeholder="t('snippet.searchPlaceholder')"
          autofocus
        />
      </div>
      <div class="w-36">
        <WhSelect v-model="cat">
          <option v-for="c in SNIPPET_CATEGORIES" :key="c" :value="c">
            {{
              c === SNIPPET_FILTER_ALL
                ? t("common.allCategories")
                : snippetCategoryLabel(c)
            }}
          </option>
        </WhSelect>
      </div>
    </div>

    <div ref="listRef" class="mt-4">
      <template v-if="filtered.length === 0">
        <EmptyState
          v-if="q || cat !== SNIPPET_FILTER_ALL"
          :title="t('snippet.noMatch')"
          :description="t('snippet.noMatchDesc')"
        />
        <EmptyState
          v-else
          :title="t('snippet.empty')"
          :description="t('snippet.emptyDesc')"
        >
          <template #action>
            <Button variant="primary" @click="creating = true">
              {{ t("snippet.add") }}
            </Button>
          </template>
        </EmptyState>
      </template>

      <div v-else class="flex flex-col gap-1">
        <div v-for="(s, i) in filtered" :key="s.id" :data-i="i">
          <ResultItem
            kind="snippet"
            :title="s.title"
            :highlight="q"
            :badge="snippetCategoryLabel(s.category)"
            :subtitle="snippetSubtitle(s)"
            :swatch-hex="snippetListSwatch(s)"
            :glyph="snippetListGlyph(s)"
            :tags="s.tags"
            :meta="relTime(s.updatedAt)"
            :selected="i === sel"
            :favorite="s.favorite"
            show-favorite
            @select="sel = i"
            @activate="navigate(`/snippets/${s.id}`)"
            @toggle-favorite="onToggleFav(s)"
          >
            <template #trailing>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="openSnippetEditor(s.id); navigate(`/snippets/${s.id}`)"
              >
                {{ t("common.edit") }}
              </button>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="deletingId = s.id"
              >
                {{ t("common.delete") }}
              </button>
            </template>
          </ResultItem>
        </div>
      </div>
    </div>

    <Modal
      :open="creating"
      :title="t('snippet.create')"
      :width="560"
      @close="closeForm"
      @submit="submitForm"
    >
      <Field :label="t('common.title')" required :error="errTitle">
        <WhInput v-model="fTitle" :placeholder="titlePlaceholder" autofocus />
      </Field>
      <div class="grid grid-cols-2 gap-4">
        <Field :label="t('common.category')" required>
          <WhSelect v-model="fCategory">
            <option v-for="c in SNIPPET_FORM_CATEGORIES" :key="c" :value="c">
              {{ snippetCategoryLabel(c) }}
            </option>
          </WhSelect>
        </Field>
        <Field v-if="!isSpecialForm" :label="t('common.language')">
          <WhInput
            v-model="fLanguage"
            :placeholder="t('snippet.placeholderLanguage')"
          />
        </Field>
      </div>
      <Field :label="t('common.tags')">
        <TagInput ref="tagInputRef" v-model="fTags" />
      </Field>
      <Field
        v-if="isColorForm"
        :label="t('snippet.colorValue')"
        required
        :error="errCode"
        :hint="t('snippet.colorHint')"
      >
        <HexColorInput v-model="fCode" />
      </Field>
      <Field
        v-else-if="isSymbolForm"
        :label="t('snippet.symbol')"
        required
        :error="errCode"
        :hint="t('snippet.symbolHint')"
      >
        <SymbolPicker v-model="fCode" @pick="onSymbolPick" />
      </Field>
      <Field
        v-else
        :label="t('snippet.codeContent')"
        required
        :error="errCode"
        :hint="t('snippet.variableHint')"
      >
        <WhTextarea
          v-model="fCode"
          mono
          :placeholder="t('snippet.placeholderCode')"
        />
      </Field>
    </Modal>

    <ConfirmDialog
      :open="!!deletingId"
      :title="t('snippet.deleteTitle')"
      :description="t('snippet.deleteDesc')"
      :confirm-text="t('common.delete')"
      @cancel="deletingId = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
