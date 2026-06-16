<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import WhIcon from "./WhIcon.vue";
import Button from "./Button.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    submitText?: string;
    cancelText?: string;
    submitVariant?: "primary" | "danger";
    width?: number;
    showFooter?: boolean;
  }>(),
  {
    submitText: undefined,
    cancelText: undefined,
    submitVariant: "primary",
    width: 480,
    showFooter: true,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit"): void;
}>();

const { t } = useI18n();
const resolvedSubmit = computed(() => props.submitText ?? t("common.save"));
const resolvedCancel = computed(() => props.cancelText ?? t("common.cancel"));

function isTextarea(target: EventTarget | null) {
  return (target as HTMLElement | null)?.tagName === "TEXTAREA";
}

function onEscape(e: KeyboardEvent) {
  if (!props.open || e.key !== "Escape") return;
  e.stopPropagation();
  emit("close");
}

function shouldDeferEnterSubmit(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (isTextarea(el)) return true;
  return !!el.closest("[data-wh-tag-input]");
}

function onEnter(e: KeyboardEvent) {
  if (!props.open || e.key !== "Enter") return;

  const mod = e.ctrlKey || e.metaKey;
  if (shouldDeferEnterSubmit(e.target) && !mod) return;

  e.preventDefault();
  e.stopPropagation();
  emit("submit");
}

onMounted(() => {
  window.addEventListener("keydown", onEscape, true);
  window.addEventListener("keydown", onEnter, true);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onEscape, true);
  window.removeEventListener("keydown", onEnter, true);
});

function onOverlay(e: MouseEvent) {
  if (e.target === e.currentTarget) emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="wh-toast">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
        @mousedown="onOverlay"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :style="{ width: width + 'px' }"
          class="rounded-[var(--radius-xl)] bg-surface shadow-pop"
        >
          <div
            class="flex items-center justify-between border-b border-border px-5 py-4"
          >
            <h2 class="text-section text-text">{{ title }}</h2>
            <button
              type="button"
              :aria-label="t('common.close')"
              class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-text-secondary hover:bg-surface-hover"
              @click="emit('close')"
            >
              <WhIcon name="close" :size="18" />
            </button>
          </div>
          <div class="scroll-y max-h-[70vh] px-5 py-4">
            <slot />
          </div>
          <div
            v-if="showFooter"
            class="flex justify-end gap-2 border-t border-border px-5 py-3"
          >
            <Button variant="secondary" @click="emit('close')">{{
              resolvedCancel
            }}</Button>
            <Button :variant="submitVariant" @click="emit('submit')">{{
              resolvedSubmit
            }}</Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
