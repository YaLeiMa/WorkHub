<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import WhInput from "./WhInput.vue";
import { SYMBOL_GROUPS } from "@/lib/workhub/symbolUtils";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "pick", payload: { symbol: string; title: string; tags: string[] }): void;
}>();

const { t } = useI18n();

const preview = computed(() => props.modelValue.trim().split("\n")[0] ?? "");

function select(symbol: string, title: string, tags: string[]) {
  emit("update:modelValue", symbol);
  emit("pick", { symbol, title, tags });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="flex h-20 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface-hover text-4xl shadow-sm"
      :class="preview ? 'text-text' : 'text-text-placeholder'"
    >
      {{ preview || "?" }}
    </div>

    <WhInput
      :model-value="modelValue"
      :placeholder="t('symbolPicker.placeholder')"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <div class="flex flex-col gap-3">
      <div v-for="group in SYMBOL_GROUPS" :key="group.id">
        <div class="mb-1.5 text-caption font-medium text-text-secondary">
          {{ group.label }}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="item in group.items"
            :key="`${group.id}-${item.symbol}`"
            type="button"
            :title="item.title"
            class="flex size-9 items-center justify-center rounded-[var(--radius-md)] border text-lg transition-transform hover:scale-105"
            :class="
              modelValue === item.symbol
                ? 'border-primary bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] shadow-sm'
                : 'border-border bg-surface hover:bg-surface-hover'
            "
            @click="select(item.symbol, item.title, item.tags)"
          >
            {{ item.symbol }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
