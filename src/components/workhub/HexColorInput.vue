<script setup lang="ts">
import { computed } from "vue";
import WhInput from "./WhInput.vue";
import { isValidHex, normalizeHex } from "@/lib/workhub/colorUtils";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const pickerValue = computed(() => {
  const hex = normalizeHex(props.modelValue);
  return hex ?? "#000000";
});

const showPreview = computed(() => isValidHex(props.modelValue));

function onTextInput(v: string) {
  emit("update:modelValue", v);
}

function onPickerInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  emit("update:modelValue", v.toUpperCase());
}
</script>

<template>
  <div class="flex items-center gap-3">
    <label class="relative shrink-0 cursor-pointer">
      <span
        class="block size-10 rounded-[var(--radius-md)] border border-border shadow-sm"
        :style="{ backgroundColor: showPreview ? pickerValue : 'transparent' }"
      />
      <input
        type="color"
        class="absolute inset-0 cursor-pointer opacity-0"
        :value="pickerValue"
        @input="onPickerInput"
      />
    </label>
    <WhInput
      class="min-w-0 flex-1 font-mono"
      :model-value="modelValue"
      placeholder="#409EFF"
      @update:model-value="onTextInput"
    />
  </div>
</template>
