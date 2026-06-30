<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    placeholder?: string;
    /** 单个标签最大长度，默认 20（片段/项目标签）；XML 字段名等场景可加大 */
    maxTagLength?: number;
  }>(),
  { placeholder: "", maxTagLength: 20 },
);

const { t } = useI18n();
const resolvedPlaceholder = computed(
  () => props.placeholder || t("tagInput.placeholder"),
);
const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const draft = ref("");

// 回车 / 失焦 / 保存前提交输入框中的标签（去重）
function flushDraft() {
  const value = draft.value.trim().slice(0, props.maxTagLength);
  if (!value) return;
  if (props.modelValue.includes(value)) {
    draft.value = "";
    return;
  }
  emit("update:modelValue", [...props.modelValue, value]);
  draft.value = "";
}

function add() {
  flushDraft();
}

defineExpose({ flushDraft });

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    add();
  } else if (e.key === "Backspace" && !draft.value && props.modelValue.length) {
    // 输入为空时退格删除最后一个标签
    emit("update:modelValue", props.modelValue.slice(0, -1));
  }
}

function remove(tag: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((item) => item !== tag),
  );
}
</script>

<template>
  <div
    data-wh-tag-input
    class="wh-field flex min-h-9 flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1 focus-within:border-primary"
  >
    <span
      v-for="tag in modelValue"
      :key="tag"
      class="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-hover px-2 text-caption text-text"
    >
      {{ tag }}
      <button
        type="button"
        :aria-label="t('tagInput.deleteTag', { tag })"
        class="text-text-secondary hover:text-danger"
        @click="remove(tag)"
      >
        ×
      </button>
    </span>
    <input
      v-model="draft"
      :placeholder="modelValue.length ? '' : resolvedPlaceholder"
      class="h-7 min-w-[120px] flex-1 bg-transparent text-body text-text outline-none"
      @keydown="onKey"
      @blur="flushDraft"
    />
  </div>
</template>
