<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import WhInput from "../WhInput.vue";
import WhTextarea from "../WhTextarea.vue";
import WhSelect from "../WhSelect.vue";
import HexColorInput from "../HexColorInput.vue";
import type { ToolField, ToolFieldValue, ToolValues } from "@/lib/workhub/tools/types";

const props = defineProps<{
  fields: ToolField[];
  modelValue: ToolValues;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ToolValues): void;
}>();

const { t } = useI18n();
const rootRef = ref<HTMLElement | null>(null);

const visibleFields = computed(() =>
  props.fields.filter((f) => !f.visibleWhen || f.visibleWhen(props.modelValue)),
);

/** 首个可聚焦的文本类字段（text / textarea / number） */
const firstFocusableKey = computed(() => {
  const field = visibleFields.value.find(
    (f) => f.type === "text" || f.type === "textarea" || f.type === "number",
  );
  return field?.key ?? null;
});

function shouldAutofocus(field: ToolField): boolean {
  return field.key === firstFocusableKey.value;
}

/** 紧凑字段（select / number）占半列，其余占整行 */
function isCompact(field: ToolField): boolean {
  return field.type === "select" || field.type === "number";
}

function set(key: string, value: ToolFieldValue) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

function asString(value: ToolFieldValue | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

function optionLabel(field: ToolField, label: string): string {
  return field.optionsRaw ? label : t(label);
}

function focusFirst() {
  void nextTick(() => {
    requestAnimationFrame(() => {
      const root = rootRef.value;
      if (!root) return;
      const el = root.querySelector<HTMLElement>("textarea, input:not([type='range']):not([type='color'])");
      el?.focus();
    });
  });
}

defineExpose({ focusFirst });

onMounted(focusFirst);
</script>

<template>
  <div ref="rootRef" class="grid grid-cols-2 gap-x-3 gap-y-3">
    <template v-for="field in visibleFields" :key="field.key">
      <!-- 开关：整行内联（标签左、开关右） -->
      <div
        v-if="field.type === 'switch'"
        class="col-span-2 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
      >
        <span class="text-caption text-text">{{ t(field.labelKey) }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="!!modelValue[field.key]"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
          :class="modelValue[field.key] ? 'bg-primary' : 'bg-border'"
          @click="set(field.key, !modelValue[field.key])"
        >
          <span
            class="inline-block size-5 transform rounded-full bg-white shadow transition-transform"
            :class="modelValue[field.key] ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </button>
      </div>

      <!-- 其余字段：标签在上、控件在下 -->
      <div v-else :class="isCompact(field) ? 'col-span-1' : 'col-span-2'">
        <div class="mb-1.5 text-caption text-text-secondary">
          {{ t(field.labelKey) }}
        </div>

        <WhTextarea
          v-if="field.type === 'textarea'"
          :model-value="asString(modelValue[field.key])"
          :placeholder="field.placeholderKey ? t(field.placeholderKey) : ''"
          :mono="field.mono"
          :autofocus="shouldAutofocus(field)"
          @update:model-value="set(field.key, $event)"
        />

        <WhSelect
          v-else-if="field.type === 'select'"
          :model-value="asString(modelValue[field.key])"
          @update:model-value="set(field.key, $event)"
        >
          <option
            v-for="opt in field.options ?? []"
            :key="opt.value"
            :value="opt.value"
          >
            {{ optionLabel(field, opt.label) }}
          </option>
        </WhSelect>

        <HexColorInput
          v-else-if="field.type === 'color'"
          :model-value="asString(modelValue[field.key])"
          @update:model-value="set(field.key, $event)"
        />

        <div v-else-if="field.type === 'slider'" class="flex items-center gap-3">
          <input
            type="range"
            class="min-w-0 flex-1 accent-primary"
            :min="field.min ?? 0"
            :max="field.max ?? 100"
            :step="field.step ?? 1"
            :value="Number(modelValue[field.key] ?? field.min ?? 0)"
            @input="set(field.key, Number(($event.target as HTMLInputElement).value))"
          />
          <span
            class="w-12 shrink-0 text-right text-caption text-text-secondary tabular-nums"
          >
            {{ asString(modelValue[field.key]) }}
          </span>
        </div>

        <WhInput
          v-else-if="field.type === 'number'"
          :model-value="asString(modelValue[field.key])"
          :placeholder="field.placeholderKey ? t(field.placeholderKey) : ''"
          :autofocus="shouldAutofocus(field)"
          @update:model-value="set(field.key, Number($event) || 0)"
        />

        <WhInput
          v-else
          :model-value="asString(modelValue[field.key])"
          :placeholder="field.placeholderKey ? t(field.placeholderKey) : ''"
          :autofocus="shouldAutofocus(field)"
          @update:model-value="set(field.key, $event)"
        />
      </div>
    </template>
  </div>
</template>
