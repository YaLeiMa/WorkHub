<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import ProjectGroupNodeView from "./ProjectGroupNode.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import {
  countProjectsInNode,
  encodeGroupParent,
  type ProjectGroupNode,
} from "@/lib/workhub/projectGroups";
import { relTime } from "@/lib/workhub/utils";
import type { Project } from "@/lib/workhub/types";

const props = defineProps<{
  node: ProjectGroupNode;
  siblingIndex: number;
  parentPath: string;
}>();

type ProjectsPageCtx = {
  canDrag: { value: boolean };
  sel: { value: number };
  q: { value: string };
  pointerDrag: { value: { kind: string; id?: string; key?: string } | null };
  dragProjectId: { value: string | null };
  dragGroupKey: { value: string | null };
  dropHint: { value: { groupKey: string; index: number } | null };
  groupDropKey: { value: string | null };
  groupDropParent: { value: string | null };
  flatIndexFor: (id: string) => number;
  onProjectGripDown: (e: PointerEvent, projectId: string) => void;
  onGroupGripDown: (
    e: PointerEvent,
    groupKey: string,
    parentPath: string,
    siblingIndex: number,
  ) => void;
  onSelectProject: (index: number) => void;
  onActivateProject: (id: string) => void;
  onToggleFav: (p: Project) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (id: string) => void;
  onRenameGroup: (key: string) => void;
  onDissolveGroup: (key: string) => void;
  isDropBefore: (groupKey: string, index: number) => boolean;
  isGroupCollapsed: (key: string) => boolean;
  toggleGroupCollapsed: (key: string) => void;
};

const ctx = inject<ProjectsPageCtx>("projectsPageCtx")!;
const { t } = useI18n();

const isUngrouped = computed(() => props.node.key === "");
const projectCount = computed(() => countProjectsInNode(props.node));
const indent = computed(() => `${props.node.depth * 16}px`);
const hasBody = computed(
  () => props.node.projects.length > 0 || props.node.children.length > 0,
);
const collapsed = computed(() => ctx.isGroupCollapsed(props.node.key));

function toggleCollapsed() {
  if (!hasBody.value) return;
  ctx.toggleGroupCollapsed(props.node.key);
}

const isGroupDropTarget = computed(
  () =>
    ctx.groupDropParent.value === props.parentPath &&
    ctx.groupDropKey.value === props.node.key,
);

function isGroupDragging() {
  return (
    ctx.pointerDrag.value?.kind === "group" &&
    ctx.dragGroupKey.value === props.node.key
  );
}
</script>

<template>
  <section
    class="rounded-[var(--radius-md)]"
    :class="[
      isGroupDragging() ? 'pointer-events-none opacity-60' : '',
    ]"
    :style="{ marginLeft: node.depth > 0 ? indent : undefined }"
  >
    <div
      class="group-drop-zone project-drop-zone group/header mb-1.5 flex cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-surface-hover/60"
      :class="[
        ctx.dropHint.value?.groupKey === node.key &&
        ctx.dropHint.value.index === node.projects.length
          ? 'bg-primary/10'
          : '',
        collapsed ? 'mb-0' : '',
        isGroupDropTarget ? 'ring-1 ring-primary/30' : '',
      ]"
      data-group-drop
      :data-group-drop-parent="encodeGroupParent(parentPath)"
      :data-group-drop-key="node.key"
      :data-group-drop-index="siblingIndex"
      :data-project-drop-key="node.key"
      :data-project-drop-index="node.projects.length"
      @click="toggleCollapsed"
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <button
          v-if="hasBody"
          type="button"
          class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-caption text-text-secondary hover:bg-surface-hover"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? t('project.expandGroup') : t('project.collapseGroup')"
          @click.stop="toggleCollapsed"
        >
          {{ collapsed ? "▶" : "▼" }}
        </button>
        <span v-else class="inline-block w-6 shrink-0" aria-hidden="true" />
        <span
          v-if="ctx.canDrag.value && !isUngrouped"
          class="touch-none cursor-grab text-caption text-text-placeholder select-none active:cursor-grabbing"
          :title="t('project.dragGroupOrder')"
          @pointerdown.stop="
            ctx.onGroupGripDown($event, node.key, parentPath, siblingIndex)
          "
          @click.stop
        >
          ⠿
        </span>
        <h2
          class="truncate text-section"
          :class="node.depth > 0 ? 'text-body font-medium' : ''"
        >
          {{ isUngrouped ? t("project.ungrouped") : node.segment }}
        </h2>
      </div>
      <div class="flex shrink-0 items-center gap-2" @click.stop>
        <div
          v-if="!isUngrouped"
          class="flex gap-1 opacity-0 transition group-hover/header:opacity-100"
        >
          <button
            type="button"
            class="h-7 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
            @click.stop="ctx.onRenameGroup(node.key)"
          >
            {{ t("project.renameLabel") }}
          </button>
          <button
            type="button"
            class="h-7 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
            @click.stop="ctx.onDissolveGroup(node.key)"
          >
            {{ t("project.dissolve") }}
          </button>
        </div>
        <span class="text-caption text-text-secondary">{{
          t("project.projectCount", { n: projectCount })
        }}</span>
      </div>
    </div>

    <div v-show="!collapsed" class="flex flex-col gap-1">
      <template v-for="(p, rowIndex) in node.projects" :key="p.id">
        <div
          v-if="ctx.isDropBefore(node.key, rowIndex)"
          class="h-0.5 rounded-full bg-primary"
        />
        <div
          :data-i="ctx.flatIndexFor(p.id)"
          class="project-drop-zone flex items-stretch gap-1"
          :data-project-drop-key="node.key"
          :data-project-drop-index="rowIndex"
          :class="
            ctx.pointerDrag.value?.kind === 'project' &&
            ctx.dragProjectId.value === p.id
              ? 'opacity-60'
              : ''
          "
        >
          <span
            v-if="ctx.canDrag.value"
            class="touch-none flex w-6 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-sm)] text-caption text-text-placeholder hover:bg-surface-hover active:cursor-grabbing"
            :title="t('project.dragSort')"
            @pointerdown="ctx.onProjectGripDown($event, p.id)"
          >
            ⠿
          </span>
          <div class="min-w-0 flex-1">
            <ResultItem
              kind="project"
              :title="p.name"
              :highlight="ctx.q.value"
              :subtitle="`${p.description} · ${p.path}`"
              :tags="p.tags"
              :meta="relTime(p.updatedAt)"
              :selected="ctx.flatIndexFor(p.id) === ctx.sel.value"
              :favorite="p.favorite"
              show-favorite
              @select="ctx.onSelectProject(ctx.flatIndexFor(p.id))"
              @activate="ctx.onActivateProject(p.id)"
              @toggle-favorite="ctx.onToggleFav(p)"
            >
              <template #trailing>
                <button
                  type="button"
                  class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                  @click.stop="ctx.onEditProject(p)"
                >
                  {{ t("common.edit") }}
                </button>
                <button
                  type="button"
                  class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                  @click.stop="ctx.onDeleteProject(p.id)"
                >
                  {{ t("common.delete") }}
                </button>
              </template>
            </ResultItem>
          </div>
        </div>
      </template>

      <div
        v-if="ctx.isDropBefore(node.key, node.projects.length)"
        class="h-0.5 rounded-full bg-primary"
      />
      <div
        v-if="ctx.canDrag.value"
        class="project-drop-zone h-2 shrink-0"
        :data-project-drop-key="node.key"
        :data-project-drop-index="node.projects.length"
      />

      <ProjectGroupNodeView
        v-for="(child, childIndex) in node.children"
        :key="child.key"
        :node="child"
        :sibling-index="childIndex"
        :parent-path="node.key"
      />
    </div>
  </section>
</template>
