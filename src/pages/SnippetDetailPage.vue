<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "@/components/workhub/Button.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import WhTextarea from "@/components/workhub/WhTextarea.vue";
import WhSelect from "@/components/workhub/WhSelect.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import CodeViewer from "@/components/workhub/CodeViewer.vue";
import HexColorInput from "@/components/workhub/HexColorInput.vue";
import SymbolPicker from "@/components/workhub/SymbolPicker.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import { isColorSnippet, isValidHex, normalizeHex } from "@/lib/workhub/colorUtils";
import {
  snippetListGlyph,
  snippetListSwatch,
} from "@/lib/workhub/snippetDisplay";
import { requestSnippetCopy } from "@/lib/workhub/snippetCopy";
import { extractSnippetVariables } from "@/lib/workhub/snippetVariables";
import {
  isSymbolSnippet,
  isValidSymbol,
  normalizeSymbol,
} from "@/lib/workhub/symbolUtils";
import {
  SNIPPET_FORM_CATEGORIES,
  snippetCategoryLabel,
} from "@/lib/workhub/labels";
import {
  consumeSnippetPendingEdit,
  deleteSnippet,
  getSnippet,
  updateSnippet,
} from "@/lib/workhub/snippetsStore";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import { toast } from "@/lib/workhub/toast";
import type { SnippetCategory } from "@/lib/workhub/types";

const props = defineProps<{ id: string }>();
const { t } = useI18n();

const original = computed(() => getSnippet(props.id));
const editing = ref(false);
const deleting = ref(false);
const tagInputRef = ref<{ flushDraft: () => void } | null>(null);

const fTitle = ref("");
const fCategory = ref<SnippetCategory>("shell");
const fLanguage = ref("");
const fTags = ref<string[]>([]);
const fCode = ref("");
const errTitle = ref("");
const errCode = ref("");

const isColorForm = computed(() => isColorSnippet(fCategory.value));
const isSymbolForm = computed(() => isSymbolSnippet(fCategory.value));
const isSpecialForm = computed(() => isColorForm.value || isSymbolForm.value);
const viewSwatch = computed(() =>
  original.value ? snippetListSwatch(original.value) : undefined,
);
const viewGlyph = computed(() =>
  original.value ? snippetListGlyph(original.value) : undefined,
);
const codeVariables = computed(() =>
  original.value ? extractSnippetVariables(original.value.code) : [],
);

function copySnippet() {
  if (!original.value) return;
  requestSnippetCopy(original.value, {
    kind: "snippet",
    refId: original.value.id,
    title: original.value.title,
    subtitle: original.value.category,
  });
}

function enterEdit() {
  const s = original.value;
  if (!s) return;
  fTitle.value = s.title;
  fCategory.value = s.category;
  fLanguage.value = s.language;
  fTags.value = [...s.tags];
  fCode.value = s.code;
  errTitle.value = "";
  editing.value = true;
}

function cancel() {
  editing.value = false;
  errTitle.value = "";
}

async function save() {
  if (!original.value) return;
  tagInputRef.value?.flushDraft();

  errTitle.value = fTitle.value.trim() ? "" : t("snippet.errTitle");
  if (isColorForm.value) {
    errCode.value = isValidHex(fCode.value) ? "" : t("snippet.errColor");
  } else if (isSymbolForm.value) {
    errCode.value = isValidSymbol(fCode.value) ? "" : t("snippet.errSymbolShort");
  } else {
    errCode.value = "";
  }
  if (errTitle.value || errCode.value) return;

  const code = isColorForm.value
    ? (normalizeHex(fCode.value) ?? fCode.value.trim())
    : isSymbolForm.value
      ? (normalizeSymbol(fCode.value) ?? fCode.value.trim())
      : fCode.value;

  try {
    await updateSnippet(props.id, {
      title: fTitle.value.trim(),
      category: fCategory.value,
      language: isSpecialForm.value ? "" : fLanguage.value.trim(),
      tags: [...fTags.value],
      code,
    });
    toast.success(t("toast.saved"));
    editing.value = false;
  } catch {
    toast.error(t("toast.saveFailed"));
  }
}

async function confirmDelete() {
  try {
    await deleteSnippet(props.id);
    toast.success(t("toast.deleted"));
    navigate("/snippets");
  } catch {
    toast.error(t("toast.deleteFailed"));
  }
  deleting.value = false;
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function onWin(e: KeyboardEvent) {
  if (!original.value) return;
  if (deleting.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (editing.value) cancel();
    else navigate("/snippets");
  } else if (!editing.value && e.key.toLowerCase() === "e" && !isEditable(e.target)) {
    e.preventDefault();
    enterEdit();
  } else if (!editing.value && e.key === "Delete" && !isEditable(e.target)) {
    e.preventDefault();
    deleting.value = true;
  } else if (editing.value && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    save();
  }
}

watch(
  editing,
  (on) => {
    setStatusHint(on ? "snippet.statusEdit" : "snippet.statusView");
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", onWin);
  if (original.value && consumeSnippetPendingEdit(props.id)) {
    enterEdit();
  }
});
onUnmounted(() => window.removeEventListener("keydown", onWin));
</script>

<template>
  <EmptyState v-if="!original" :title="t('snippet.notFound')">
    <template #action>
      <Button @click="navigate('/snippets')">{{ t("snippet.backToList") }}</Button>
    </template>
  </EmptyState>

  <div v-else>
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-caption text-text-secondary hover:text-text"
          @click="navigate('/snippets')"
        >
          ← {{ t("snippet.title") }}
        </button>
        <span class="text-caption text-text-placeholder">/</span>
        <span class="text-caption text-text-secondary">
          {{ editing ? fTitle : original.title }}
        </span>
      </div>
      <div class="flex gap-2">
        <template v-if="editing">
          <Button @click="cancel">{{ t("common.cancel") }}</Button>
          <Button variant="primary" @click="save">{{ t("common.save") }}</Button>
        </template>
        <template v-else>
          <Button variant="danger" @click="deleting = true">{{
            t("common.delete")
          }}</Button>
          <Button variant="primary" @click="enterEdit">{{ t("common.edit") }}</Button>
        </template>
      </div>
    </div>

    <section
      v-if="editing"
      class="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-card"
    >
      <Field :label="t('common.title')" required :error="errTitle">
        <WhInput
          v-model="fTitle"
          :placeholder="t('snippet.placeholderTitleDefault')"
          autofocus
        />
      </Field>
      <div class="grid grid-cols-2 gap-4">
        <Field :label="t('common.category')">
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
      >
        <HexColorInput v-model="fCode" />
      </Field>
      <Field
        v-else-if="isSymbolForm"
        :label="t('snippet.symbol')"
        required
        :error="errCode"
      >
        <SymbolPicker v-model="fCode" />
      </Field>
      <Field
        v-else
        :label="t('snippet.codeContent')"
        required
        :hint="t('snippet.variableHint')"
      >
        <WhTextarea v-model="fCode" mono />
      </Field>
    </section>

    <section
      v-else
      class="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-card"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="text-section">{{ original.title }}</h2>
        <span
          class="rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] px-1.5 py-0.5 text-caption text-primary"
        >
          {{ snippetCategoryLabel(original.category) }}
        </span>
        <span
          v-for="tag in original.tags"
          :key="tag"
          class="rounded-[var(--radius-sm)] bg-surface-hover px-1.5 py-0.5 text-caption text-text-secondary"
        >
          {{ tag }}
        </span>
      </div>
      <div v-if="viewSwatch" class="flex flex-col items-start gap-4">
        <span
          class="h-24 w-full max-w-xs rounded-[var(--radius-lg)] border border-border shadow-card"
          :style="{ backgroundColor: viewSwatch }"
        />
        <div class="flex items-center gap-3">
          <code class="font-mono text-body text-text">{{ viewSwatch }}</code>
          <Button variant="secondary" @click="copySnippet">
            {{ t("snippet.copyColor") }}
          </Button>
        </div>
      </div>
      <div v-else-if="viewGlyph" class="flex flex-col items-start gap-4">
        <div
          class="flex h-28 w-full max-w-xs items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface-hover text-6xl shadow-card"
        >
          {{ viewGlyph }}
        </div>
        <Button variant="secondary" @click="copySnippet">
          {{ t("snippet.copySymbol") }}
        </Button>
      </div>
      <div v-else class="flex flex-col gap-3">
        <div
          v-if="codeVariables.length"
          class="flex flex-wrap items-center gap-1.5 text-caption text-text-secondary"
        >
          <span>{{ t("snippet.variables") }}:</span>
          <span
            v-for="v in codeVariables"
            :key="v.name"
            class="rounded-[var(--radius-sm)] bg-surface-hover px-1.5 py-0.5 font-mono text-text"
          >
            {{ v.name }}
          </span>
        </div>
        <CodeViewer
          :code="original.code"
          :language="original.language"
          :category="original.category"
        />
        <div>
          <Button variant="secondary" @click="copySnippet">
            {{ t("snippet.copyCode") }}
          </Button>
        </div>
      </div>
    </section>

    <ConfirmDialog
      :open="deleting"
      :title="t('snippet.deleteTitle')"
      :description="t('snippet.deleteDesc')"
      :confirm-text="t('common.delete')"
      @cancel="deleting = false"
      @confirm="confirmDelete"
    />
  </div>
</template>
