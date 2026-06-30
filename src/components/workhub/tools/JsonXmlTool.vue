<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import WhIcon from "../WhIcon.vue";
import WhTextarea from "../WhTextarea.vue";
import TagInput from "../TagInput.vue";
import type { ToolContext } from "@/lib/workhub/tools/types";
import { isListCopyChord } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";
import {
  DEFAULT_UNWRAP_FIELDS,
  jsonToXml,
  xmlToJson,
  type JsonXmlOptions,
} from "@/lib/workhub/tools/jsonXml";
import {
  deleteJsonXmlPreset,
  getActiveJsonXmlPrefs,
  jsonXmlToolStore,
  loadJsonXmlToolState,
  saveJsonXmlAsPreset,
  saveJsonXmlToolPrefs,
  setJsonXmlActivePreset,
  type JsonXmlIndent,
  type JsonXmlMode,
  type JsonXmlToolPrefs,
} from "@/lib/workhub/jsonXmlToolStore";

const props = withDefaults(
  defineProps<{
    ctx: ToolContext;
    compact?: boolean;
  }>(),
  { compact: false },
);

const { t } = useI18n();

type Mode = JsonXmlMode;

const mode = ref<Mode>("x2j");
const input = ref("");
const indent = ref<JsonXmlIndent>("2");
const keepAttributes = ref(false);
const xmlDeclaration = ref(false);
const stripNsPrefix = ref(true);
const unwrapEnabled = ref(true);
const unwrapFields = ref<string[]>([...DEFAULT_UNWRAP_FIELDS]);
const parseEmbeddedXml = ref(true);
const activePresetId = ref("");
const presetNameDraft = ref("");
const prefsReady = ref(false);

const rootRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof WhTextarea> | null>(null);

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function collectPrefs(): JsonXmlToolPrefs {
  return {
    mode: mode.value,
    indent: indent.value,
    keepAttributes: keepAttributes.value,
    xmlDeclaration: xmlDeclaration.value,
    stripNsPrefix: stripNsPrefix.value,
    unwrapEnabled: unwrapEnabled.value,
    unwrapFields: [...unwrapFields.value],
    parseEmbeddedXml: parseEmbeddedXml.value,
  };
}

function applyPrefs(prefs: JsonXmlToolPrefs) {
  prefsReady.value = false;
  mode.value = prefs.mode;
  indent.value = prefs.indent;
  keepAttributes.value = prefs.keepAttributes;
  xmlDeclaration.value = prefs.xmlDeclaration;
  stripNsPrefix.value = prefs.stripNsPrefix;
  unwrapEnabled.value = prefs.unwrapEnabled;
  unwrapFields.value = [...prefs.unwrapFields];
  parseEmbeddedXml.value = prefs.parseEmbeddedXml;
  void nextTick(() => {
    prefsReady.value = true;
  });
}

function scheduleSavePrefs() {
  if (!prefsReady.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveJsonXmlToolPrefs(collectPrefs());
  }, 250);
}

async function onPresetChange(id: string) {
  activePresetId.value = id;
  const prefs = await setJsonXmlActivePreset(id);
  applyPrefs(prefs);
}

async function savePreset() {
  const name = presetNameDraft.value.trim();
  if (!name) return;
  await saveJsonXmlAsPreset(name, collectPrefs());
  activePresetId.value = jsonXmlToolStore.activePresetId;
  presetNameDraft.value = "";
  props.ctx.toast.success(t("tools.jsonXml.presetSaved", { name }));
}

async function removeActivePreset() {
  const id = activePresetId.value;
  if (!id) return;
  const name = jsonXmlToolStore.presets.find((p) => p.id === id)?.name ?? "";
  await deleteJsonXmlPreset(id);
  activePresetId.value = "";
  applyPrefs(getActiveJsonXmlPrefs());
  props.ctx.toast.success(t("tools.jsonXml.presetDeleted", { name }));
}

const options = computed<JsonXmlOptions>(() => ({
  indent: indent.value === "tab" ? "tab" : Number(indent.value),
  keepAttributes: keepAttributes.value,
  xmlDeclaration: xmlDeclaration.value,
  stripNsPrefix: stripNsPrefix.value,
  unwrapFields: unwrapEnabled.value ? unwrapFields.value : [],
  parseEmbeddedXml: parseEmbeddedXml.value,
}));

function resetUnwrapFields() {
  unwrapFields.value = [...DEFAULT_UNWRAP_FIELDS];
}

const result = computed<{ ok: boolean; value: string }>(() => {
  const src = input.value.trim();
  if (!src) return { ok: true, value: "" };
  try {
    if (mode.value === "j2x") {
      return { ok: true, value: jsonToXml(src, options.value) };
    }
    return { ok: true, value: xmlToJson(src, options.value) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      value:
        mode.value === "j2x"
          ? t("tools.jsonXml.invalidJson", { msg })
          : t("tools.jsonXml.invalidXml", { msg }),
    };
  }
});

const splitClass = computed(() =>
  props.compact
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 gap-4 md:grid-cols-2",
);

function copyResult() {
  if (!result.value.ok || !result.value.value) return;
  props.ctx.copy(result.value.value, t("tools.jsonXml.copied"));
}

function focusInput(selectAll = false) {
  inputRef.value?.focus();
  if (selectAll) inputRef.value?.select();
}

function setMode(next: Mode) {
  mode.value = next;
  void nextTick(() => focusInput(false));
}

function clearInput() {
  input.value = "";
  void nextTick(() => focusInput(false));
}

function onKey(e: KeyboardEvent) {
  if (isListCopyChord(e)) {
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") {
      const ta = target as HTMLTextAreaElement;
      if (ta.selectionStart !== ta.selectionEnd) return;
    }
    e.preventDefault();
    e.stopPropagation();
    copyResult();
    return;
  }

  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "SELECT" || target.tagName === "INPUT") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    copyResult();
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    setMode("j2x");
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    setMode("x2j");
    return;
  }

  if (e.key === "Delete" && rootRef.value?.contains(e.target as Node)) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-wh-tag-input]")) return;
    e.preventDefault();
    e.stopPropagation();
    clearInput();
  }
}

watch(mode, () => setStatusHint("tools.jsonXml.statusHint"));

watch(
  [
    mode,
    indent,
    keepAttributes,
    xmlDeclaration,
    stripNsPrefix,
    unwrapEnabled,
    unwrapFields,
    parseEmbeddedXml,
  ],
  scheduleSavePrefs,
  { deep: true },
);

onMounted(async () => {
  await loadJsonXmlToolState();
  activePresetId.value = jsonXmlToolStore.activePresetId;
  applyPrefs(getActiveJsonXmlPrefs());
  setStatusHint("tools.jsonXml.statusHint");
  void nextTick(() => focusInput(false));
});

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer);
  setStatusHint("tools.statusHint");
});
</script>

<template>
  <div
    ref="rootRef"
    class="flex flex-col gap-4 outline-none"
    tabindex="-1"
    @keydown="onKey"
  >
    <!-- 工具栏：左方向 Tab + 右选项 -->
    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border"
      role="tablist"
    >
      <div class="flex gap-5">
        <button
          v-for="m in (['j2x', 'x2j'] as Mode[])"
          :key="m"
          type="button"
          role="tab"
          :aria-selected="mode === m"
          class="relative -mb-px pb-2.5 text-body transition-colors"
          :class="
            mode === m
              ? 'font-medium text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
              : 'text-text-secondary hover:text-text'
          "
          @click="setMode(m)"
        >
          {{ m === "j2x" ? t("tools.jsonXml.modeJsonToXml") : t("tools.jsonXml.modeXmlToJson") }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 text-caption">
        <label class="flex items-center gap-1 text-text-secondary">
          {{ t("tools.jsonXml.indent") }}
          <select
            v-model="indent"
            class="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-text outline-none focus:border-primary"
          >
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <template v-if="mode === 'x2j'">
          <label class="flex items-center gap-1 text-text-secondary">
            <input v-model="parseEmbeddedXml" type="checkbox" class="accent-[var(--color-primary)]" />
            {{ t("tools.jsonXml.parseEmbeddedXml") }}
          </label>
          <label class="flex items-center gap-1 text-text-secondary">
            <input v-model="unwrapEnabled" type="checkbox" class="accent-[var(--color-primary)]" />
            {{ t("tools.jsonXml.unwrapEnabled") }}
          </label>
          <label class="flex items-center gap-1 text-text-secondary">
            <input v-model="stripNsPrefix" type="checkbox" class="accent-[var(--color-primary)]" />
            {{ t("tools.jsonXml.stripNsPrefix") }}
          </label>
          <label class="flex items-center gap-1 text-text-secondary">
            <input v-model="keepAttributes" type="checkbox" class="accent-[var(--color-primary)]" />
            {{ t("tools.jsonXml.keepAttributes") }}
          </label>
          <label class="flex items-center gap-1 text-text-secondary">
            <input v-model="xmlDeclaration" type="checkbox" class="accent-[var(--color-primary)]" />
            {{ t("tools.jsonXml.xmlDeclaration") }}
          </label>
        </template>
      </div>
    </div>

    <template v-if="mode === 'x2j'">
    <div
      class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-[color-mix(in_oklab,var(--color-surface-hover)_35%,transparent)] px-3 py-2"
    >
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1.5 text-caption text-text-secondary">
          {{ t("tools.jsonXml.presetLabel") }}
          <select
            :value="activePresetId"
            class="max-w-[200px] rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-0.5 text-body text-text outline-none focus:border-primary"
            @change="onPresetChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("tools.jsonXml.presetAuto") }}</option>
            <option
              v-for="p in jsonXmlToolStore.presets"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </select>
        </label>
        <input
          v-model="presetNameDraft"
          type="text"
          maxlength="40"
          :placeholder="t('tools.jsonXml.presetSavePlaceholder')"
          class="min-w-[120px] flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-0.5 text-caption text-text outline-none focus:border-primary"
          @keydown.enter.prevent="savePreset"
        />
        <button
          type="button"
          class="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-0.5 text-caption text-text hover:bg-surface-hover"
          @click="savePreset"
        >
          {{ t("tools.jsonXml.presetSave") }}
        </button>
        <button
          v-if="activePresetId"
          type="button"
          class="rounded-[var(--radius-sm)] px-2 py-0.5 text-caption text-danger hover:bg-danger/10"
          @click="removeActivePreset"
        >
          {{ t("tools.jsonXml.presetDelete") }}
        </button>
      </div>
      <p class="text-caption text-text-secondary">
        {{ t("tools.jsonXml.presetHint") }}
      </p>
    </div>

    <div
      v-if="unwrapEnabled"
      class="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border bg-[color-mix(in_oklab,var(--color-surface-hover)_35%,transparent)] px-3 py-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-caption font-medium text-text-secondary">
          {{ t("tools.jsonXml.unwrapFieldsLabel") }}
        </span>
        <button
          type="button"
          class="text-caption text-primary hover:underline"
          @click="resetUnwrapFields"
        >
          {{ t("tools.jsonXml.unwrapFieldsReset") }}
        </button>
      </div>
      <TagInput
        v-model="unwrapFields"
        :max-tag-length="128"
        :placeholder="t('tools.jsonXml.unwrapFieldsPlaceholder')"
      />
      <p class="text-caption text-text-secondary">
        {{ t("tools.jsonXml.unwrapFieldsHint") }}
      </p>
    </div>
    </template>

    <!-- 左右分栏：输入 | 结果 -->
    <div :class="splitClass">
      <div class="flex min-h-0 flex-col gap-1.5">
        <span class="text-caption font-medium text-text-secondary">
          {{ t("tools.jsonXml.input") }}
        </span>
        <WhTextarea
          ref="inputRef"
          v-model="input"
          mono
          :placeholder="
            mode === 'j2x'
              ? t('tools.jsonXml.jsonPlaceholder')
              : t('tools.jsonXml.xmlPlaceholder')
          "
        />
      </div>

      <div class="flex min-h-0 flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-caption font-medium text-text-secondary">
            {{ t("tools.jsonXml.output") }}
          </span>
          <button
            v-if="result.ok && result.value"
            type="button"
            class="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-primary hover:bg-primary/10"
            @click="copyResult"
          >
            <WhIcon name="copy" :size="14" /> {{ t("common.copy") }}
          </button>
        </div>
        <div
          v-if="!input.trim()"
          class="flex flex-1 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border bg-surface px-3 py-8 text-center text-caption text-text-secondary"
        >
          {{ t("tools.jsonXml.outputEmpty") }}
        </div>
        <div
          v-else-if="!result.ok"
          class="rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
        >
          {{ result.value }}
        </div>
        <pre
          v-else
          class="text-mono min-h-[160px] flex-1 scroll-y whitespace-pre-wrap break-all rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-body text-text"
        >{{ result.value }}</pre>
      </div>
    </div>
  </div>
</template>
