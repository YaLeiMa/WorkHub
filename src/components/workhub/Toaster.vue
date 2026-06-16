<script setup lang="ts">
import { toastState } from "@/lib/workhub/toast";
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-12 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
  >
    <TransitionGroup name="wh-toast">
      <div
        v-for="t in toastState.items"
        :key="t.id"
        role="status"
        class="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2 shadow-pop"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="
            t.kind === 'success'
              ? 'bg-success'
              : t.kind === 'error'
                ? 'bg-danger'
                : 'bg-primary'
          "
        />
        <span class="text-body text-text">{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
