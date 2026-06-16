<script setup lang="ts">
import WhIcon from "./WhIcon.vue";

defineProps<{
  title: string;
  /** 右上角文本操作（如「管理链接」），不传则不显示 */
  action?: string;
}>();

const emit = defineEmits<{
  (e: "action"): void;
}>();
</script>

<template>
  <section
    class="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-card"
  >
    <header
      class="flex items-center justify-between border-b border-border px-4 py-3"
    >
      <h2 class="text-section flex items-center gap-2">
        <WhIcon name="project" :size="16" class="text-text-secondary" />
        {{ title }}
      </h2>
      <button
        v-if="action"
        type="button"
        class="text-caption text-primary hover:underline"
        @click="emit('action')"
      >
        {{ action }}
      </button>
    </header>
    <div class="p-4">
      <slot />
    </div>
  </section>
</template>
