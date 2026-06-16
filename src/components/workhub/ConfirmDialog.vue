<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./Modal.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }>(),
  { confirmText: undefined, cancelText: undefined, danger: true },
);

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const { t } = useI18n();
const resolvedConfirm = computed(() => props.confirmText ?? t("common.confirm"));
const resolvedCancel = computed(() => props.cancelText ?? t("common.cancel"));
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :submit-text="resolvedConfirm"
    :cancel-text="resolvedCancel"
    :submit-variant="danger ? 'danger' : 'primary'"
    :width="420"
    @close="emit('cancel')"
    @submit="emit('confirm')"
  >
    <p class="text-body text-text-secondary">{{ description }}</p>
  </Modal>
</template>
