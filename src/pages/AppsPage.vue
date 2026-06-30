<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SearchBox from "@/components/workhub/SearchBox.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Button from "@/components/workhub/Button.vue";
import WhIcon from "@/components/workhub/WhIcon.vue";
import Modal from "@/components/workhub/Modal.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import { relTime } from "@/lib/workhub/utils";
import { appInitial, appTileColor } from "@/lib/workhub/appDisplay";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import { copyText, launchApp, listAppShortcuts, pickApplication } from "@/lib/workhub/actions";
import type { AppShortcutCandidate } from "@/lib/workhub/actions";
import { toast } from "@/lib/workhub/toast";
import { setStatusHint } from "@/lib/workhub/status";
import {
  appsStore,
  createApp,
  deleteApp,
  updateApp,
} from "@/lib/workhub/appsStore";
import type { LauncherApp } from "@/lib/workhub/types";

const { t } = useI18n();

const q = ref("");
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);

const creating = ref(false);
const editing = ref<LauncherApp | null>(null);
const deletingId = ref<string | null>(null);

const formOpen = computed(() => creating.value || !!editing.value);

const fTitle = ref("");
const fTarget = ref("");
const fTags = ref<string[]>([]);
const errTitle = ref("");
const errTarget = ref("");

const shortcutPickerOpen = ref(false);
const shortcutLoading = ref(false);
const shortcutQ = ref("");
const shortcutItems = ref<AppShortcutCandidate[]>([]);

const filteredShortcuts = computed(() => {
  const k = shortcutQ.value.trim().toLowerCase();
  if (!k) return shortcutItems.value;
  return shortcutItems.value.filter(
    (item) =>
      item.title.toLowerCase().includes(k) ||
      item.path.toLowerCase().includes(k) ||
      item.keywords?.some((w) => w.toLowerCase().includes(k)),
  );
});

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase();
  const list = [...appsStore.list].sort(
    (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt,
  );
  if (!k) return list;
  return list.filter(
    (a) =>
      a.title.toLowerCase().includes(k) ||
      a.target.toLowerCase().includes(k) ||
      a.tags.some((tag) => tag.toLowerCase().includes(k)),
  );
});

watch(q, () => {
  sel.value = 0;
});

watch(
  () => filtered.value.length,
  (len) => {
    if (sel.value >= len) sel.value = Math.max(0, len - 1);
  },
);

watch(sel, (index) => {
  void scrollListSelection(listRef.value, index, undefined, filtered.value.length);
});

watch(formOpen, (open) => {
  if (!open) return;
  const init = editing.value;
  fTitle.value = init?.title ?? "";
  fTarget.value = init?.target ?? "";
  fTags.value = init ? [...init.tags] : [];
  errTitle.value = "";
  errTarget.value = "";
});

function openApp(app: LauncherApp) {
  void launchApp(app.target, app.title, {
    kind: "app",
    refId: app.id,
    title: app.title,
    subtitle: app.target,
  });
}

function onKey(e: KeyboardEvent) {
  if (creating.value || editing.value || deletingId.value || shortcutPickerOpen.value) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) openApp(cur);
  } else if (
    triggerListCopy(e, () => {
      const cur = filtered.value[sel.value];
      if (cur)
        void copyText(cur.target, t("toast.copied"), {
          kind: "app",
          refId: cur.id,
          title: cur.title,
          subtitle: cur.target,
        });
    })
  ) {
    return;
  } else if (e.key === "Delete" && !shouldBlockListDelete(e.target)) {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) deletingId.value = cur.id;
  }
}

function closeForm() {
  creating.value = false;
  editing.value = null;
}

async function pickTarget() {
  const path = await pickApplication();
  if (!path) return;
  applyPickedPath(path);
}

function applyPickedPath(path: string) {
  fTarget.value = path;
  if (!fTitle.value.trim()) {
    const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
    fTitle.value = name.replace(/\.(exe|lnk|url|app|AppImage|desktop)$/i, "");
  }
}

function applyShortcut(item: AppShortcutCandidate) {
  fTarget.value = item.path;
  fTitle.value = item.title;
  shortcutPickerOpen.value = false;
}

async function openShortcutPicker() {
  shortcutPickerOpen.value = true;
  shortcutQ.value = "";
  shortcutLoading.value = true;
  shortcutItems.value = [];
  try {
    shortcutItems.value = await listAppShortcuts();
  } finally {
    shortcutLoading.value = false;
  }
}

async function submitForm() {
  errTitle.value = fTitle.value.trim() ? "" : t("appLauncher.errTitle");
  errTarget.value = fTarget.value.trim() ? "" : t("appLauncher.errTarget");
  if (errTitle.value || errTarget.value) return;

  const data = {
    title: fTitle.value.trim(),
    target: fTarget.value.trim(),
    tags: [...fTags.value],
  };

  try {
    if (editing.value) {
      await updateApp(editing.value.id, data);
      toast.success(t("toast.saved"));
    } else {
      await createApp(data);
      toast.success(t("appLauncher.added"));
    }
    closeForm();
  } catch {
    toast.error(t("toast.saveFailed"));
  }
}

async function confirmDelete() {
  if (!deletingId.value) return;
  try {
    await deleteApp(deletingId.value);
    toast.success(t("toast.deleted"));
  } catch {
    toast.error(t("toast.deleteFailed"));
  }
  deletingId.value = null;
}

onMounted(() => {
  setStatusHint("appLauncher.statusHint");
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-page-title">{{ t("appLauncher.title") }}</h1>
      <Button variant="primary" @click="creating = true">
        <WhIcon name="plus" :size="16" /> {{ t("appLauncher.add") }}
      </Button>
    </div>

    <SearchBox
      v-model="q"
      :placeholder="t('appLauncher.searchPlaceholder')"
      autofocus
    />

    <div ref="listRef" class="mt-4">
      <template v-if="filtered.length === 0">
        <EmptyState v-if="q" :title="t('appLauncher.noMatch')" />
        <EmptyState
          v-else
          :title="t('appLauncher.empty')"
          :description="t('appLauncher.emptyDesc')"
        >
          <template #action>
            <Button variant="primary" @click="creating = true">
              {{ t("appLauncher.add") }}
            </Button>
          </template>
        </EmptyState>
      </template>

      <div v-else class="flex flex-col gap-1">
        <div v-for="(app, i) in filtered" :key="app.id" :data-i="i">
          <ResultItem
            kind="app"
            :title="app.title"
            :highlight="q"
            :subtitle="app.target"
            :tags="app.tags"
            :meta="relTime(app.updatedAt)"
            :icon-letter="appInitial(app.title)"
            :icon-bg="appTileColor(app.id)"
            :selected="i === sel"
            @select="sel = i"
            @activate="openApp(app)"
          >
            <template #trailing>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="editing = app"
              >
                {{ t("common.edit") }}
              </button>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="deletingId = app.id"
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
      :title="editing ? t('appLauncher.edit') : t('appLauncher.addNew')"
      @close="closeForm"
      @submit="submitForm"
    >
      <Field :label="t('common.title')" required :error="errTitle">
        <WhInput
          v-model="fTitle"
          :placeholder="t('appLauncher.placeholderTitle')"
          autofocus
        />
      </Field>
      <Field :label="t('appLauncher.target')" required :error="errTarget">
        <div class="flex flex-wrap gap-2">
          <WhInput
            v-model="fTarget"
            class="min-w-0 flex-1 basis-[12rem]"
            :placeholder="t('appLauncher.placeholderTarget')"
          />
          <Button type="button" variant="secondary" @click="openShortcutPicker">
            {{ t("appLauncher.pickFromList") }}
          </Button>
          <Button type="button" variant="secondary" @click="pickTarget">
            {{ t("appLauncher.browse") }}
          </Button>
        </div>
      </Field>
      <Field :label="t('common.tags')">
        <TagInput v-model="fTags" :placeholder="t('tagInput.placeholder')" />
      </Field>
    </Modal>

    <Modal
      :open="shortcutPickerOpen"
      :title="t('appLauncher.pickFromList')"
      :width="560"
      :show-footer="false"
      @close="shortcutPickerOpen = false"
    >
      <SearchBox
        v-model="shortcutQ"
        :placeholder="t('appLauncher.pickFromListPlaceholder')"
        autofocus
      />
      <div class="mt-3 max-h-[min(420px,50vh)] scroll-y rounded-[var(--radius-md)] border border-border">
        <div
          v-if="shortcutLoading"
          class="px-4 py-8 text-center text-body text-text-secondary"
        >
          {{ t("app.loadingShort") }}
        </div>
        <EmptyState
          v-else-if="filteredShortcuts.length === 0"
          :title="t('appLauncher.pickFromListEmpty')"
          :description="t('appLauncher.pickFromListEmptyDesc')"
        />
        <ul v-else class="divide-y divide-border">
          <li v-for="item in filteredShortcuts" :key="item.path">
            <button
              type="button"
              class="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-hover"
              @click="applyShortcut(item)"
            >
              <span class="text-body text-text">{{ item.title }}</span>
              <span class="truncate text-caption text-text-secondary">{{
                item.path
              }}</span>
            </button>
          </li>
        </ul>
      </div>
    </Modal>

    <ConfirmDialog
      :open="!!deletingId"
      :title="t('appLauncher.deleteTitle')"
      :description="t('appLauncher.deleteDesc')"
      :confirm-text="t('common.delete')"
      @confirm="confirmDelete"
      @cancel="deletingId = null"
    />
  </div>
</template>
