<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div
      class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-text-placeholder"
    >
      <slot name="icon">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8 13s1.5 2 4 2 4-2 4-2" stroke-linecap="round" />
        </svg>
      </slot>
    </div>
    <div class="text-body text-text">{{ title }}</div>
    <div v-if="description" class="mt-1 max-w-sm text-caption text-text-secondary">
      {{ description }}
    </div>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
