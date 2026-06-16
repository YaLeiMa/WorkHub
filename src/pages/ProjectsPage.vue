<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import ProjectGroupNode from "@/components/workhub/ProjectGroupNode.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import WhIcon from "@/components/workhub/WhIcon.vue";
import Modal from "@/components/workhub/Modal.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import WhTextarea from "@/components/workhub/WhTextarea.vue";
import WhSelect from "@/components/workhub/WhSelect.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import { projectMatchesSearch, relTime } from "@/lib/workhub/utils";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import { copyText, openProject, pickDirectory } from "@/lib/workhub/actions";
import { toast } from "@/lib/workhub/toast";
import { flattenGroupTree, parentGroupPath, parseGroupPath, collectGroupNodeKeys, decodeGroupParent, encodeGroupParent } from "@/lib/workhub/projectGroups";
import {
  createProject,
  deleteProject,
  dissolveProjectGroup,
  groupProjects,
  lastGroupSegment,
  listProjectGroups,
  moveProjectInGroup,
  projectGroupKey,
  projectGroupLabel,
  projectsStore,
  renameProjectGroup,
  reorderSiblingGroupsByKey,
  toggleFavorite,
  updateProject,
  validateGroupPath,
} from "@/lib/workhub/projectsStore";
import type { Project } from "@/lib/workhub/types";

const { t } = useI18n();

const GROUP_FILTER_ALL = "";
const GROUP_FILTER_UNGROUPED = "__ungrouped__";

/** 默认全部展开；仅记录当前会话内手动收起的分组 */
const collapsedGroups = ref<Set<string>>(new Set());

const q = ref("");
const groupFilter = ref(GROUP_FILTER_ALL);
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);

const creating = ref(false);
const editing = ref<Project | null>(null);
const deletingId = ref<string | null>(null);
const renamingGroupKey = ref<string | null>(null);
const renameGroupName = ref("");
const renameGroupError = ref("");
const dissolvingGroupKey = ref<string | null>(null);

type PointerDrag =
  | { kind: "project"; id: string }
  | { kind: "group"; key: string; parentPath: string; siblingIndex: number };

const pointerDrag = ref<PointerDrag | null>(null);
const dragProjectId = ref<string | null>(null);
const dragGroupKey = ref<string | null>(null);
const dropHint = ref<{ groupKey: string; index: number } | null>(null);
const groupDropKey = ref<string | null>(null);
const groupDropParent = ref<string | null>(null);
const groupDropSiblingIndex = ref<number | null>(null);
let capturedPointerId: number | null = null;
const pointerCaptureEl = ref<HTMLElement | null>(null);

const canDrag = computed(() => !q.value.trim() && !groupFilter.value);

const projectGroups = computed(() => listProjectGroups());

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase();
  let list = projectsStore.list;

  if (k) {
    list = list.filter((p) => projectMatchesSearch(p, k));
  }

  if (groupFilter.value === GROUP_FILTER_UNGROUPED) {
    list = list.filter((p) => !p.group.trim());
  } else if (groupFilter.value) {
    const prefix = projectGroupKey(groupFilter.value);
    list = list.filter((p) => {
      const g = projectGroupKey(p.group);
      return g === prefix || g.startsWith(`${prefix}/`);
    });
  }

  return list;
});

const groupTree = computed(() => {
  if (q.value.trim()) return null;
  return groupProjects(filtered.value);
});

const flatIndexMap = computed(() => {
  const map = new Map<string, number>();
  if (!groupTree.value) return map;
  for (const row of flattenGroupTree(groupTree.value, collapsedGroups.value)) {
    map.set(row.project.id, row.flatIndex);
  }
  return map;
});

const flatList = computed(() => {
  if (groupTree.value) {
    return flattenGroupTree(groupTree.value, collapsedGroups.value).map(
      (r) => r.project,
    );
  }
  return filtered.value;
});

const hasMatchingProjects = computed(() => filtered.value.length > 0);

const allGroupsCollapsed = computed(
  () =>
    !!groupTree.value &&
    hasMatchingProjects.value &&
    flatList.value.length === 0,
);

function isGroupCollapsed(key: string) {
  return collapsedGroups.value.has(key);
}

function toggleGroupCollapsed(key: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedGroups.value = next;
}

function expandAllGroups() {
  collapsedGroups.value = new Set();
}

function collapseAllGroups() {
  if (!groupTree.value) return;
  collapsedGroups.value = new Set(collectGroupNodeKeys(groupTree.value));
}

watch(groupFilter, (f) => {
  if (!f || f === GROUP_FILTER_UNGROUPED) return;
  const parts = parseGroupPath(f);
  let acc = "";
  const next = new Set(collapsedGroups.value);
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    next.delete(acc);
  }
  collapsedGroups.value = next;
});

function flatIndexFor(id: string) {
  return flatIndexMap.value.get(id) ?? -1;
}

watch([q, groupFilter], () => {
  sel.value = 0;
});

watch(collapsedGroups, () => {
  if (sel.value >= flatList.value.length) {
    sel.value = Math.max(0, flatList.value.length - 1);
  }
});

watch(
  () => flatList.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

watch(sel, (index) => {
  void scrollListSelection(listRef.value, index, undefined, flatList.value.length);
});

function onKey(e: KeyboardEvent) {
  if (
    formOpen.value ||
    deletingId.value ||
    renamingGroupKey.value ||
    dissolvingGroupKey.value
  ) {
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, flatList.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, flatList.value.length);
  } else if (e.key === "Enter" && mod) {
    e.preventDefault();
    const cur = flatList.value[sel.value];
    if (cur) navigate(`/projects/${cur.id}`);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = flatList.value[sel.value];
    if (cur)
      openProject(cur.path, cur.name, {
        kind: "project",
        refId: cur.id,
        title: cur.name,
        subtitle: cur.path,
      });
  } else if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    const cur = flatList.value[sel.value];
    if (cur) {
      const wasFav = cur.favorite;
      toggleFavorite(cur.id);
      toast.success(wasFav ? t("toast.unfavorited") : t("toast.favorited"));
    }
  } else if (
    triggerListCopy(e, () => {
      const cur = flatList.value[sel.value];
      if (cur)
        void copyText(cur.path, t("toast.copied"), {
          kind: "project",
          refId: cur.id,
          title: cur.name,
          subtitle: cur.path,
        });
    })
  ) {
    return;
  } else if (e.key === "Delete" && !shouldBlockListDelete(e.target)) {
    e.preventDefault();
    const cur = flatList.value[sel.value];
    if (cur) deletingId.value = cur.id;
  }
}

function onToggleFav(p: Project) {
  const wasFav = p.favorite;
  toggleFavorite(p.id);
  toast.success(wasFav ? t("toast.unfavorited") : t("toast.favorited"));
}

function resetDrag() {
  if (pointerCaptureEl.value != null && capturedPointerId != null) {
    try {
      pointerCaptureEl.value.releasePointerCapture(capturedPointerId);
    } catch {
      /* ignore */
    }
  }
  pointerCaptureEl.value = null;
  capturedPointerId = null;
  pointerDrag.value = null;
  dragProjectId.value = null;
  dragGroupKey.value = null;
  dropHint.value = null;
  groupDropKey.value = null;
  groupDropParent.value = null;
  groupDropSiblingIndex.value = null;
}

function capturePointer(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  pointerCaptureEl.value = el;
  capturedPointerId = e.pointerId;
}

function findProjectDropTarget(clientX: number, clientY: number) {
  const el = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>(".project-drop-zone");
  if (!el) return null;
  return {
    groupKey: el.dataset.projectDropKey ?? "",
    index: Number(el.dataset.projectDropIndex ?? "0"),
  };
}

function findGroupDropTarget(clientX: number, clientY: number) {
  const drag = pointerDrag.value;
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const zone = (el as HTMLElement).closest<HTMLElement>(".group-drop-zone");
    if (!zone) continue;
    const parentPath = decodeGroupParent(
      zone.dataset.groupDropParent ?? encodeGroupParent(""),
    );
    const groupKey = zone.dataset.groupDropKey ?? "";
    if (!groupKey) continue;
    if (drag?.kind === "group") {
      if (parentPath !== drag.parentPath) continue;
      if (groupKey === drag.key) continue;
    }
    return {
      parentPath,
      groupKey,
      siblingIndex: Number(zone.dataset.groupDropIndex ?? "0"),
    };
  }
  return null;
}

function onWindowPointerMove(e: PointerEvent) {
  if (!pointerDrag.value) return;
  if (pointerDrag.value.kind === "project") {
    dropHint.value = findProjectDropTarget(e.clientX, e.clientY);
    groupDropKey.value = null;
    groupDropParent.value = null;
    groupDropSiblingIndex.value = null;
  } else {
    const target = findGroupDropTarget(e.clientX, e.clientY);
    if (target) {
      groupDropParent.value = target.parentPath;
      groupDropKey.value = target.groupKey;
      groupDropSiblingIndex.value = target.siblingIndex;
    } else {
      groupDropParent.value = null;
      groupDropKey.value = null;
      groupDropSiblingIndex.value = null;
    }
    dropHint.value = null;
  }
}

async function onWindowPointerUp(e: PointerEvent) {
  const drag = pointerDrag.value;
  if (!drag) return;

  if (drag.kind === "project") {
    const target =
      dropHint.value ??
      findProjectDropTarget(e.clientX, e.clientY);
    if (target) {
      try {
        await moveProjectInGroup(drag.id, target.groupKey, target.index);
        toast.success(t("project.orderUpdated"));
      } catch {
        toast.error(t("project.moveFailed"));
      }
    }
  } else {
    const hit =
      findGroupDropTarget(e.clientX, e.clientY) ??
      (groupDropKey.value != null && groupDropParent.value != null
        ? {
            parentPath: groupDropParent.value,
            groupKey: groupDropKey.value,
            siblingIndex: groupDropSiblingIndex.value ?? -1,
          }
        : null);
    if (
      hit &&
      hit.parentPath === drag.parentPath &&
      hit.groupKey !== drag.key
    ) {
      try {
        await reorderSiblingGroupsByKey(
          drag.parentPath,
          drag.key,
          hit.groupKey,
        );
        toast.success(t("project.groupOrderUpdated"));
      } catch {
        toast.error(t("project.reorderFailed"));
      }
    }
  }
  resetDrag();
}

function onProjectGripDown(e: PointerEvent, projectId: string) {
  if (!canDrag.value || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  capturePointer(e);
  pointerDrag.value = { kind: "project", id: projectId };
  dragProjectId.value = projectId;
}

function onGroupGripDown(
  e: PointerEvent,
  groupKey: string,
  parentPath: string,
  siblingIndex: number,
) {
  if (!canDrag.value || e.button !== 0 || !groupKey) return;
  e.preventDefault();
  e.stopPropagation();
  capturePointer(e);
  pointerDrag.value = { kind: "group", key: groupKey, parentPath, siblingIndex };
  dragGroupKey.value = groupKey;
}

function openRenameGroup(key: string) {
  renamingGroupKey.value = key;
  renameGroupName.value = lastGroupSegment(key);
  renameGroupError.value = "";
}

function closeRenameGroup() {
  renamingGroupKey.value = null;
  renameGroupName.value = "";
  renameGroupError.value = "";
}

async function submitRenameGroup() {
  if (!renamingGroupKey.value) return;
  const name = renameGroupName.value.trim();
  if (!name) {
    renameGroupError.value = t("project.errGroupName");
    return;
  }
  try {
    await renameProjectGroup(renamingGroupKey.value, name);
    toast.success(t("project.groupRenamed"));
    closeRenameGroup();
  } catch {
    toast.error(t("project.renameFailed"));
  }
}

async function confirmDissolveGroup() {
  if (!dissolvingGroupKey.value) return;
  try {
    await dissolveProjectGroup(dissolvingGroupKey.value);
    const parent = parentGroupPath(dissolvingGroupKey.value);
    toast.success(
      parent
        ? t("project.groupDissolvedTo", { parent })
        : t("project.groupDissolvedUngrouped"),
    );
  } catch {
    toast.error(t("project.opFailed"));
  }
  dissolvingGroupKey.value = null;
}

function isDropBefore(groupKey: string, index: number) {
  return (
    dropHint.value?.groupKey === groupKey && dropHint.value.index === index
  );
}

onMounted(() => {
  setStatusHint("project.statusHint");
  document.addEventListener("pointermove", onWindowPointerMove, {
    capture: true,
  });
  document.addEventListener("pointerup", onWindowPointerUp, { capture: true });
  document.addEventListener("pointercancel", onWindowPointerUp, {
    capture: true,
  });
});

onUnmounted(() => {
  document.removeEventListener("pointermove", onWindowPointerMove, {
    capture: true,
  });
  document.removeEventListener("pointerup", onWindowPointerUp, { capture: true });
  document.removeEventListener("pointercancel", onWindowPointerUp, {
    capture: true,
  });
});

/* ---------- 表单弹窗 ---------- */
const formOpen = computed(() => creating.value || !!editing.value);

const fName = ref("");
const fDesc = ref("");
const fPath = ref("");
const fGitUrl = ref("");
const fGroup = ref("");
const fTags = ref<string[]>([]);
const errName = ref("");
const errPath = ref("");
const errGitUrl = ref("");
const errGroup = ref("");
const tagInputRef = ref<{ flushDraft: () => void } | null>(null);

watch(formOpen, (open) => {
  if (!open) return;
  const init = editing.value;
  fName.value = init?.name ?? "";
  fDesc.value = init?.description ?? "";
  fPath.value = init?.path ?? "";
  fGitUrl.value = init?.gitUrl ?? "";
  fGroup.value = init?.group ?? "";
  fTags.value = init ? [...init.tags] : [];
  errName.value = "";
  errPath.value = "";
  errGitUrl.value = "";
  errGroup.value = "";
});

function closeForm() {
  creating.value = false;
  editing.value = null;
}

async function pickProjectPath() {
  const path = await pickDirectory();
  if (path) fPath.value = path;
}

async function submitForm() {
  tagInputRef.value?.flushDraft();

  errName.value = fName.value.trim() ? "" : t("project.errName");
  errPath.value = fPath.value.trim() ? "" : t("project.errPath");
  errGroup.value = validateGroupPath(fGroup.value) ?? "";
  const git = fGitUrl.value.trim();
  if (git && !/^https?:\/\/.+/i.test(git)) {
    errGitUrl.value = t("project.errGit");
  } else {
    errGitUrl.value = "";
  }
  if (errName.value || errPath.value || errGroup.value || errGitUrl.value) return;

  const data = {
    name: fName.value.trim(),
    description: fDesc.value.trim(),
    path: fPath.value.trim(),
    gitUrl: git,
    group: fGroup.value.trim(),
    tags: [...fTags.value],
  };

  try {
    if (editing.value) {
      await updateProject(editing.value.id, data);
      toast.success(t("toast.saved"));
    } else {
      await createProject(data);
      toast.success(t("project.created"));
    }
    closeForm();
  } catch {
    toast.error(t("toast.saveFailed"));
  }
}

async function confirmDelete() {
  if (!deletingId.value) return;
  try {
    await deleteProject(deletingId.value);
    toast.success(t("toast.deleted"));
  } catch {
    toast.error(t("toast.deleteFailed"));
  }
  deletingId.value = null;
}

provide("projectsPageCtx", {
  canDrag,
  sel,
  q,
  pointerDrag,
  dragProjectId,
  dragGroupKey,
  dropHint,
  groupDropKey,
  groupDropParent,
  flatIndexFor,
  onProjectGripDown,
  onGroupGripDown,
  onSelectProject: (index: number) => {
    sel.value = index;
  },
  onActivateProject: (id: string) => navigate(`/projects/${id}`),
  onToggleFav,
  onEditProject: (p: Project) => {
    editing.value = p;
  },
  onDeleteProject: (id: string) => {
    deletingId.value = id;
  },
  onRenameGroup: openRenameGroup,
  onDissolveGroup: (key: string) => {
    dissolvingGroupKey.value = key;
  },
  isDropBefore,
  isGroupCollapsed,
  toggleGroupCollapsed,
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-page-title">{{ t("project.title") }}</h1>
      <Button variant="primary" @click="creating = true">
        <WhIcon name="plus" :size="16" /> {{ t("project.add") }}
      </Button>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchBox
        v-model="q"
        class="min-w-0 flex-1"
        :placeholder="t('project.searchPlaceholder')"
        autofocus
      />
      <WhSelect
        v-model="groupFilter"
        class="w-full shrink-0 sm:w-44"
        :aria-label="t('project.filterByGroup')"
      >
        <option :value="GROUP_FILTER_ALL">{{ t("project.allGroups") }}</option>
        <option :value="GROUP_FILTER_UNGROUPED">{{ t("project.ungrouped") }}</option>
        <option v-for="g in projectGroups" :key="g" :value="g">
          {{ "\u3000".repeat(Math.max(0, parseGroupPath(g).length - 1)) }}{{ g }}
        </option>
      </WhSelect>
    </div>

    <div ref="listRef" class="mt-4">
      <template v-if="!hasMatchingProjects">
        <EmptyState
          v-if="q || groupFilter"
          :title="t('project.noMatch')"
          :description="t('project.noMatchDesc')"
        />
        <EmptyState
          v-else
          :title="t('project.empty')"
          :description="t('project.emptyDesc')"
        >
          <template #action>
            <Button variant="primary" @click="creating = true">{{
              t("project.add")
            }}</Button>
          </template>
        </EmptyState>
      </template>

      <div v-else-if="groupTree" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-caption text-text-secondary">
            <template v-if="allGroupsCollapsed">
              {{ t("project.groupsCollapsed") }}
            </template>
            <template v-else-if="canDrag">
              {{ t("project.groupsHint") }}
            </template>
          </p>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="h-7 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click="expandAllGroups"
            >
              {{ t("project.expandAll") }}
            </button>
            <button
              type="button"
              class="h-7 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click="collapseAllGroups"
            >
              {{ t("project.collapseAll") }}
            </button>
          </div>
        </div>
        <ProjectGroupNode
          v-for="(node, i) in groupTree"
          :key="node.key || 'ungrouped'"
          :node="node"
          :sibling-index="i"
          parent-path=""
        />
      </div>

      <div v-else class="flex flex-col gap-1">
        <div
          v-for="(p, i) in flatList"
          :key="p.id"
          :data-i="i"
        >
          <ResultItem
            kind="project"
            :title="p.name"
            :highlight="q"
            :subtitle="`${projectGroupLabel(p.group)} · ${p.description} · ${p.path}`"
            :tags="p.tags"
            :meta="relTime(p.updatedAt)"
            :selected="i === sel"
            :favorite="p.favorite"
            show-favorite
            @select="sel = i"
            @activate="navigate(`/projects/${p.id}`)"
            @toggle-favorite="onToggleFav(p)"
          >
            <template #trailing>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="editing = p"
              >
                {{ t("common.edit") }}
              </button>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="deletingId = p.id"
              >
                {{ t("common.delete") }}
              </button>
            </template>
          </ResultItem>
        </div>
      </div>
    </div>

    <Modal
      :open="formOpen"
      :title="editing ? t('project.edit') : t('project.add')"
      @close="closeForm"
      @submit="submitForm"
    >
      <Field :label="t('project.name')" required :error="errName">
        <WhInput
          v-model="fName"
          :placeholder="t('project.placeholderName')"
          autofocus
        />
      </Field>
      <Field :label="t('project.description')">
        <WhTextarea
          v-model="fDesc"
          :placeholder="t('project.placeholderDesc')"
        />
      </Field>
      <Field :label="t('project.localPath')" required :error="errPath">
        <div class="flex gap-2">
          <WhInput
            v-model="fPath"
            class="min-w-0 flex-1"
            :placeholder="t('project.placeholderPath')"
          />
          <Button variant="secondary" type="button" @click.stop="pickProjectPath">
            {{ t("project.pickDir") }}
          </Button>
        </div>
      </Field>
      <Field :label="t('project.gitUrl')" :error="errGitUrl">
        <WhInput
          v-model="fGitUrl"
          :placeholder="t('project.placeholderGit')"
        />
      </Field>
      <Field :label="t('project.group')" :error="errGroup">
        <WhInput
          v-model="fGroup"
          :placeholder="t('project.placeholderGroup')"
          list="project-group-suggestions"
        />
        <p class="mt-1 text-caption text-text-secondary">
          {{ t("project.groupPathHint") }}
        </p>
        <datalist id="project-group-suggestions">
          <option v-for="g in projectGroups" :key="g" :value="g" />
        </datalist>
      </Field>
      <Field :label="t('common.tags')">
        <TagInput ref="tagInputRef" v-model="fTags" />
      </Field>
    </Modal>

    <Modal
      :open="!!renamingGroupKey"
      :title="t('project.renameGroup')"
      @close="closeRenameGroup"
      @submit="submitRenameGroup"
    >
      <Field :label="t('project.renameGroupCurrent')" required :error="renameGroupError">
        <WhInput
          v-model="renameGroupName"
          :placeholder="t('project.renameGroupPlaceholder')"
          autofocus
        />
        <p v-if="renamingGroupKey" class="mt-1 text-caption text-text-secondary">
          {{ t("project.renameGroupFullPath", { path: renamingGroupKey }) }}
        </p>
      </Field>
    </Modal>

    <ConfirmDialog
      :open="!!dissolvingGroupKey"
      :title="t('project.dissolveGroup')"
      :description="
        t('project.dissolveGroupDesc', { name: dissolvingGroupKey ?? '' })
      "
      :confirm-text="t('project.dissolve')"
      @cancel="dissolvingGroupKey = null"
      @confirm="confirmDissolveGroup"
    />

    <ConfirmDialog
      :open="!!deletingId"
      :title="t('project.deleteProject')"
      :description="t('project.deleteDesc')"
      :confirm-text="t('common.delete')"
      @cancel="deletingId = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
