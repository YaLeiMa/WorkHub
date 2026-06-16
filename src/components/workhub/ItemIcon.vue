<script setup lang="ts">
import { computed } from "vue";
import WhIcon from "./WhIcon.vue";
import type { ItemKind } from "@/lib/workhub/types";
import { resolveItemIcon } from "@/lib/workhub/itemIcon";

const props = withDefaults(
  defineProps<{
    kind: ItemKind;
    /** 文件路径、URL 或标题，用于推断扩展名 */
    pathHint?: string;
    size?: number;
  }>(),
  { size: 28 },
);

const visual = computed(() => resolveItemIcon(props.kind, props.pathHint));

const box = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));

const letterSize = computed(() =>
  (visual.value.mode === "badge" && visual.value.badge.letter.length > 1
    ? props.size * 0.28
    : props.size * 0.42
  ).toFixed(1),
);
</script>

<template>
  <span
    v-if="visual.mode === 'badge'"
    class="inline-flex shrink-0 items-center justify-center rounded-[5px] font-bold leading-none shadow-sm"
    :style="{
      ...box,
      backgroundColor: visual.badge.bg,
      color: visual.badge.fg,
      fontSize: `${letterSize}px`,
    }"
    aria-hidden="true"
  >
    {{ visual.badge.letter }}
  </span>

  <svg
    v-else-if="visual.mode === 'folder'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    class="shrink-0"
    aria-hidden="true"
  >
    <path
      d="M3 7.5A2 2 0 0 1 5 5.5h5l2 2h9a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5z"
      fill="#F4B400"
      stroke="#D9A006"
      stroke-width="1.2"
      stroke-linejoin="round"
    />
    <path
      d="M3 8.5h18"
      stroke="#E5B800"
      stroke-width="1.2"
      stroke-linecap="round"
    />
  </svg>

  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center"
    :style="box"
  >
    <WhIcon
      :name="visual.name"
      :size="Math.round(size * 0.72)"
      :style="visual.tint ? { color: visual.tint } : undefined"
    />
  </span>
</template>
