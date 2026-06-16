<script setup lang="ts">
defineProps<{
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}>();
</script>

<template>
  <label class="mb-4 block last:mb-0">
    <div class="mb-1.5 text-caption text-text">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-danger">*</span>
    </div>
    <slot />
    <div
      v-if="error || hint"
      class="mt-1 text-caption"
      :class="error ? 'text-danger' : 'text-text-secondary'"
    >
      {{ error ?? hint }}
    </div>
  </label>
</template>
