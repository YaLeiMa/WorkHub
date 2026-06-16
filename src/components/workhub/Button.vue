<script setup lang="ts">
import { computed } from "vue";

type Variant = "primary" | "secondary" | "danger" | "text" | "icon";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    disabled?: boolean;
    type?: "button" | "submit";
    ariaLabel?: string;
  }>(),
  { variant: "secondary", disabled: false, type: "button" },
);

const base =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed";

const styles: Record<Variant, string> = {
  primary:
    "h-9 px-4 rounded-[var(--radius-md)] bg-primary text-white hover:bg-primary-hover",
  secondary:
    "h-9 px-4 rounded-[var(--radius-md)] bg-surface border border-border text-text hover:bg-surface-hover",
  danger:
    "h-9 px-4 rounded-[var(--radius-md)] bg-danger text-white hover:bg-danger-hover",
  text: "h-8 px-2 rounded-[var(--radius-md)] text-primary hover:bg-surface-hover",
  icon: "h-8 w-8 rounded-[var(--radius-md)] text-text-secondary hover:bg-surface-hover",
};

const cls = computed(() => `${base} ${styles[props.variant]}`);
</script>

<template>
  <button :type="type" :class="cls" :disabled="disabled" :aria-label="ariaLabel">
    <slot />
  </button>
</template>
