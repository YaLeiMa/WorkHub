<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ItemIcon from "./ItemIcon.vue";
import WhIcon from "./WhIcon.vue";
import type { ItemKind } from "@/lib/workhub/types";

const props = withDefaults(
  defineProps<{
    kind: ItemKind;
    title: string;
    /** 命中关键词，传入则高亮标题中的命中片段 */
    highlight?: string;
    /** 标题后的分类徽标（主色弱底），如片段分类 */
    badge?: string;
    subtitle?: string;
    tags?: string[];
    meta?: string;
    selected?: boolean;
    favorite?: boolean;
    /** 色值预览，如 #409EFF */
    swatchHex?: string;
    /** 符号/Emoji 大图标预览 */
    glyph?: string;
    /** 应用页字母图标 */
    iconLetter?: string;
    iconBg?: string;
    /** 用于推断文件类型图标（默认用 subtitle） */
    iconPath?: string;
    /** 是否展示收藏按钮 */
    showFavorite?: boolean;
  }>(),
  { selected: false, favorite: false, showFavorite: false },
);

const emit = defineEmits<{
  (e: "select"): void;
  (e: "activate"): void;
  (e: "toggleFavorite"): void;
}>();

const { t } = useI18n();

const visibleTags = computed(() => props.tags?.slice(0, 3) ?? []);
const overflow = computed(
  () => (props.tags?.length ?? 0) - visibleTags.value.length,
);

// 将标题按命中关键词切分为「前 / 命中 / 后」三段
const titleParts = computed(() => {
  const q = props.highlight?.trim();
  if (!q) return { before: props.title, hit: "", after: "" };
  const idx = props.title.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return { before: props.title, hit: "", after: "" };
  return {
    before: props.title.slice(0, idx),
    hit: props.title.slice(idx, idx + q.length),
    after: props.title.slice(idx + q.length),
  };
});

const iconHint = computed(() => props.iconPath ?? props.subtitle ?? props.title);
</script>

<template>
  <div
    role="option"
    :aria-selected="selected"
    class="relative flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors duration-150"
    :class="selected ? 'bg-surface-active' : 'bg-surface hover:bg-surface-hover'"
    @click="emit('select')"
    @dblclick="emit('activate')"
  >
    <span
      v-if="selected"
      class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-primary"
    />
    <span
      v-if="swatchHex"
      class="size-7 shrink-0 rounded-[5px] border border-border shadow-sm"
      :style="{ backgroundColor: swatchHex }"
    />
    <span
      v-else-if="glyph"
      class="flex size-7 shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface-hover text-lg leading-none shadow-sm"
    >
      {{ glyph }}
    </span>
    <span
      v-else-if="iconLetter && iconBg"
      class="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold leading-none text-white shadow-sm"
      :style="{ backgroundColor: iconBg }"
      aria-hidden="true"
    >
      {{ iconLetter }}
    </span>
    <ItemIcon
      v-else
      :kind="kind"
      :path-hint="iconHint"
      :size="28"
    />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-body text-text">
          {{ titleParts.before
          }}<span v-if="titleParts.hit" class="font-semibold text-primary">{{
            titleParts.hit
          }}</span>{{ titleParts.after }}
        </span>
        <span
          v-if="badge"
          class="shrink-0 rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] px-1.5 py-0.5 text-caption text-primary"
        >
          {{ badge }}
        </span>
        <span
          v-for="t in visibleTags"
          :key="t"
          class="shrink-0 rounded-[var(--radius-sm)] bg-surface-hover px-1.5 py-0.5 text-caption text-text-secondary"
        >
          {{ t }}
        </span>
        <span v-if="overflow > 0" class="shrink-0 text-caption text-text-secondary">
          +{{ overflow }}
        </span>
      </div>
      <div v-if="subtitle" class="mt-0.5 truncate text-caption text-text-secondary">
        {{ subtitle }}
      </div>
    </div>
    <span v-if="meta" class="shrink-0 text-caption text-text-secondary">{{ meta }}</span>
    <slot name="trailing" />
    <button
      v-if="showFavorite"
      type="button"
      :aria-label="favorite ? t('common.unfavorite') : t('common.favorite')"
      class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] hover:bg-surface-hover"
      :class="favorite ? 'text-warning' : 'text-text-secondary'"
      @click.stop="emit('toggleFavorite')"
    >
      <WhIcon name="star" :size="16" :filled="favorite" />
    </button>
  </div>
</template>
