<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import WhIcon from "./WhIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    autofocus?: boolean;
  }>(),
  {
    placeholder: "",
    autofocus: false,
  },
);

const { t } = useI18n();
const resolvedPlaceholder = computed(
  () => props.placeholder || t("home.searchPlaceholder"),
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

export type SearchBoxFocusOptions = {
  /** 全局快捷键唤起时全选，便于直接覆盖；日常输入默认光标在末尾 */
  selectAll?: boolean;
};

function focus(options?: SearchBoxFocusOptions) {
  const el = inputRef.value;
  if (!el) return;
  el.focus();
  if (options?.selectAll) {
    el.select();
    return;
  }
  const pos = el.value.length;
  el.setSelectionRange(pos, pos);
}

// 暴露 focus，供上层（Alt+Z 全局唤起）调用
defineExpose({ focus });

onMounted(() => {
  if (props.autofocus) inputRef.value?.focus();
});

function onInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
}

// Esc 清空（已空时交还上层全局处理）
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.modelValue) {
    e.stopPropagation();
    emit("update:modelValue", "");
  }
}
</script>

<template>
  <div
    class="wh-field relative flex h-10 items-center rounded-[var(--radius-md)] bg-surface border border-border transition focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(51,112,255,.2)]"
  >
    <WhIcon name="search" :size="18" class="ml-3 shrink-0 text-text-secondary" />
    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="resolvedPlaceholder"
      :aria-label="t('common.search')"
      class="h-full flex-1 bg-transparent px-3 text-body text-text outline-none"
      data-wh-list-search
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      v-if="modelValue"
      type="button"
      :aria-label="t('common.clearSearch')"
      class="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-surface-hover"
      @click="emit('update:modelValue', '')"
    >
      <WhIcon name="close" :size="16" />
    </button>
  </div>
</template>
