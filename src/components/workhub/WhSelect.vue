<script setup lang="ts">
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <select
    :value="modelValue"
    class="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-body text-text outline-none focus:border-primary"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>
