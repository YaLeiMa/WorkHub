<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    autofocus?: boolean;
  }>(),
  { placeholder: "", autofocus: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const el = ref<HTMLInputElement | null>(null);

onMounted(() => {
  if (props.autofocus) el.value?.focus();
});
</script>

<template>
  <input
    ref="el"
    :value="modelValue"
    :placeholder="placeholder"
    class="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-body text-text outline-none focus:border-primary"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
