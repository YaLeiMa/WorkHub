<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    /** 等宽字体 + 更高最小高度，用于代码输入 */
    mono?: boolean;
  }>(),
  { placeholder: "", mono: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const cls = computed(() =>
  props.mono ? "text-mono min-h-[200px]" : "text-body min-h-[80px]",
);
</script>

<template>
  <textarea
    :value="modelValue"
    :placeholder="placeholder"
    class="w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-text outline-none focus:border-primary"
    :class="cls"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
