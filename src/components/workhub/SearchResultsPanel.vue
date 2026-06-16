<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ResultItem from "./ResultItem.vue";
import EmptyState from "./EmptyState.vue";
import { relTime } from "@/lib/workhub/utils";
import { searchGroupLabel, type SearchGroupKey } from "@/lib/workhub/labels";
import type { SearchGroup, SearchRow } from "@/lib/workhub/useGlobalSearch";

const props = defineProps<{
  grouped: [SearchGroup, SearchRow[]][];
  hits: SearchRow[];
  debounced: string;
  sel: number;
  compact?: boolean;
  searchScope?: SearchGroupKey | null;
}>();

const emit = defineEmits<{
  (e: "update:sel", value: number): void;
  (e: "activate", row: SearchRow): void;
}>();

const { t } = useI18n();

const scopeLabel = computed(() =>
  props.searchScope ? searchGroupLabel(props.searchScope) : "",
);

const waitingForKeyword = computed(
  () =>
    !!props.searchScope &&
    !props.debounced.trim() &&
    props.searchScope !== "clipboard",
);
</script>

<template>
  <EmptyState
    v-if="waitingForKeyword"
    :title="t('searchPrefix.scopeWaiting')"
    :description="t('searchPrefix.scopeWaitingDesc', { scope: scopeLabel })"
  />

  <EmptyState
    v-else-if="hits.length === 0"
    :title="t('home.noResults')"
    :description="t('home.noResultsDesc')"
  />

  <div v-else class="flex flex-col" :class="compact ? 'gap-3' : 'gap-5'">
    <section v-for="[group, items] in grouped" :key="group">
      <div class="mb-1.5 flex items-center justify-between">
        <h2 :class="compact ? 'text-caption font-semibold text-text-secondary' : 'text-section'">
          {{ searchGroupLabel(group) }}
        </h2>
        <span class="text-caption text-text-secondary">{{
          t("common.items", { n: items.length })
        }}</span>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="h in items" :key="h.id" :data-i="hits.indexOf(h)">
          <ResultItem
            :kind="h.kind"
            :title="h.title"
            :highlight="debounced"
            :badge="h.badge"
            :subtitle="h.subtitle"
            :tags="h.tags"
            :swatch-hex="h.swatchHex"
            :glyph="h.glyph"
            :meta="compact ? undefined : relTime(h.updatedAt)"
            :selected="hits.indexOf(h) === sel"
            @select="emit('update:sel', hits.indexOf(h))"
            @activate="emit('activate', h)"
          />
        </div>
      </div>
    </section>
  </div>
</template>
