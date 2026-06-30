<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CodeViewer from "../CodeViewer.vue";
import WhIcon from "../WhIcon.vue";
import { copyText } from "@/lib/workhub/actions";
import type { ToolCopyLine, ToolResultView } from "@/lib/workhub/tools/types";

const props = defineProps<{
  result: ToolResultView;
}>();

const { t } = useI18n();

const sel = ref(0);

const copyItems = computed<ToolCopyLine[]>(() =>
  props.result.type === "copyLines" ? props.result.items : [],
);

function copyItem(item: ToolCopyLine) {
  copyText(item.value, t("tools.result.copied", { label: item.label }));
}

function onKey(e: KeyboardEvent) {
  const items = copyItems.value;
  if (items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    sel.value = (sel.value + 1) % items.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    sel.value = (sel.value - 1 + items.length) % items.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = items[sel.value];
    if (cur) copyItem(cur);
  }
}

watch(
  () => props.result,
  () => {
    sel.value = 0;
  },
);

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div>
    <div
      v-if="result.type === 'error'"
      class="rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
    >
      {{ result.message }}
    </div>

    <CodeViewer
      v-else-if="result.type === 'code'"
      :code="result.value"
      :language="result.language"
    />

    <div
      v-else-if="result.type === 'copyLines'"
      class="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface divide-y divide-border"
    >
      <div
        v-for="(item, i) in result.items"
        :key="item.label"
        class="relative flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors"
        :class="i === sel ? 'bg-surface-active' : 'hover:bg-surface-hover'"
        @click="sel = i"
        @dblclick="copyItem(item)"
      >
        <span
          v-if="i === sel"
          class="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary"
        />
        <span
          v-if="item.label === 'HEX'"
          class="size-7 shrink-0 rounded-[var(--radius-sm)] border border-border shadow-sm"
          :style="{ backgroundColor: item.value }"
          aria-hidden="true"
        />
        <span class="w-9 shrink-0 text-caption font-medium text-text-secondary">
          {{ item.label }}
        </span>
        <code class="text-mono min-w-0 flex-1 truncate text-body text-text">{{
          item.value
        }}</code>
        <button
          type="button"
          :aria-label="t('common.copy')"
          class="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
          @click.stop="copyItem(item)"
        >
          <WhIcon name="copy" :size="14" />
        </button>
      </div>
    </div>

    <div
      v-else-if="result.type === 'text'"
      class="relative rounded-[var(--radius-md)] border border-border bg-surface"
    >
      <pre
        class="text-mono max-h-[300px] scroll-y whitespace-pre-wrap break-words px-3 py-2 text-body text-text"
      >{{ result.value }}</pre>
      <button
        v-if="result.copyable !== false"
        type="button"
        :aria-label="t('common.copy')"
        class="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] bg-surface px-2 text-caption text-text-secondary hover:bg-surface-hover"
        @click="copyText(result.value)"
      >
        <WhIcon name="copy" :size="14" /> {{ t("common.copy") }}
      </button>
    </div>

    <div
      v-else-if="result.type === 'image'"
      class="flex flex-col items-center rounded-[var(--radius-md)] border border-border bg-surface p-4"
    >
      <img
        :src="result.src"
        :alt="result.alt ?? ''"
        class="max-h-[300px] rounded-[var(--radius-sm)] bg-white p-2 shadow-sm"
      />
    </div>

    <component
      :is="result.component"
      v-else-if="result.type === 'custom'"
      v-bind="result.props"
    />
  </div>
</template>
