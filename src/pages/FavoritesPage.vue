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
import WhSelect from "@/components/workhub/WhSelect.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import { relTime } from "@/lib/workhub/utils";
import { handleListArrowDown, handleListArrowUp, scrollListSelection } from "@/lib/workhub/listScroll";
import { shouldBlockListDelete, triggerListCopy } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";
import {
  openFile,
  openUrl,
  copyText,
  pickDirectory,
  pickDocument,
} from "@/lib/workhub/actions";
import { toast } from "@/lib/workhub/toast";
import {
  createFavorite,
  deleteFavorite,
  favoritesStore,
  updateFavorite,
} from "@/lib/workhub/favoritesStore";
import type { Favorite } from "@/lib/workhub/types";

const { t } = useI18n();

const q = ref("");
const sel = ref(0);
const listRef = ref<HTMLElement | null>(null);

const creating = ref(false);
const editing = ref<Favorite | null>(null);
const deletingId = ref<string | null>(null);

const formOpen = computed(() => creating.value || !!editing.value);

const fKind = ref<Favorite["kind"]>("link");
const fTitle = ref("");
const fTarget = ref("");
const fTags = ref<string[]>([]);
const errTitle = ref("");
const errTarget = ref("");
const tagInputRef = ref<{ flushDraft: () => void } | null>(null);

const targetLabel = computed(() => {
  switch (fKind.value) {
    case "link":
      return t("favorite.targetLink");
    case "folder":
      return t("favorite.targetFolder");
    case "file":
      return t("favorite.targetFile");
    case "doc":
      return t("favorite.targetDoc");
    default:
      return t("favorite.targetDefault");
  }
});

const targetPlaceholder = computed(() => {
  switch (fKind.value) {
    case "link":
      return t("favorite.placeholderLink");
    case "folder":
      return t("favorite.placeholderFolder");
    case "file":
      return t("favorite.placeholderFile");
    case "doc":
      return t("favorite.placeholderDoc");
    default:
      return t("favorite.placeholderDefault");
  }
});

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase();
  if (!k) return favoritesStore.list;
  return favoritesStore.list.filter(
    (f) =>
      f.title.toLowerCase().includes(k) ||
      f.target.toLowerCase().includes(k) ||
      f.tags.some((tag) => tag.toLowerCase().includes(k)),
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
  fKind.value = init?.kind ?? "link";
  fTitle.value = init?.title ?? "";
  fTarget.value = init?.target ?? "";
  fTags.value = init ? [...init.tags] : [];
  errTitle.value = "";
  errTarget.value = "";
});

function open(f: Favorite) {
  const meta = {
    kind: f.kind,
    refId: f.id,
    title: f.title,
    subtitle: f.target,
  };
  if (f.kind === "link") openUrl(f.target, meta);
  else openFile(f.target, t("toast.opened"), meta);
}

function onKey(e: KeyboardEvent) {
  if (creating.value || editing.value || deletingId.value) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    handleListArrowDown(sel, listRef.value, filtered.value.length);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    handleListArrowUp(sel, listRef.value, filtered.value.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cur = filtered.value[sel.value];
    if (cur) open(cur);
  } else if (
    triggerListCopy(e, () => {
      const cur = filtered.value[sel.value];
      if (cur)
        void copyText(cur.target, t("toast.copied"), {
          kind: cur.kind,
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

async function pickTargetPath() {
  if (fKind.value === "folder") {
    const path = await pickDirectory();
    if (path) fTarget.value = path;
    return;
  }
  if (fKind.value === "file" || fKind.value === "doc") {
    const path = await pickDocument();
    if (!path) return;
    fTarget.value = path;
    if (!fTitle.value.trim()) {
      const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
      fTitle.value = name;
    }
  }
}

async function submitForm() {
  tagInputRef.value?.flushDraft();

  errTitle.value = fTitle.value.trim() ? "" : t("favorite.errTitle");
  errTarget.value = fTarget.value.trim()
    ? ""
    : t("favorite.errTarget", { label: targetLabel.value });
  if (errTitle.value || errTarget.value) return;

  const data = {
    kind: fKind.value,
    title: fTitle.value.trim(),
    target: fTarget.value.trim(),
    tags: [...fTags.value],
  };

  try {
    if (editing.value) {
      await updateFavorite(editing.value.id, data);
      toast.success(t("toast.saved"));
    } else {
      await createFavorite(data);
      toast.success(t("favorite.added"));
    }
    closeForm();
  } catch {
    toast.error(t("toast.saveFailed"));
  }
}

async function confirmDelete() {
  if (!deletingId.value) return;
  try {
    await deleteFavorite(deletingId.value);
    toast.success(t("toast.deleted"));
  } catch {
    toast.error(t("toast.deleteFailed"));
  }
  deletingId.value = null;
}

onMounted(() => {
  setStatusHint("favorite.statusHint");
});
</script>

<template>
  <div class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-page-title">{{ t("favorite.title") }}</h1>
      <Button variant="primary" @click="creating = true">
        <WhIcon name="plus" :size="16" /> {{ t("favorite.add") }}
      </Button>
    </div>

    <SearchBox
      v-model="q"
      :placeholder="t('favorite.searchPlaceholder')"
      autofocus
    />

    <div ref="listRef" class="mt-4">
      <template v-if="filtered.length === 0">
        <EmptyState v-if="q" :title="t('favorite.noMatch')" />
        <EmptyState
          v-else
          :title="t('favorite.empty')"
          :description="t('favorite.emptyDesc')"
        >
          <template #action>
            <Button variant="primary" @click="creating = true">
              {{ t("favorite.add") }}
            </Button>
          </template>
        </EmptyState>
      </template>

      <div v-else class="flex flex-col gap-1">
        <div v-for="(f, i) in filtered" :key="f.id" :data-i="i">
          <ResultItem
            :kind="f.kind"
            :title="f.title"
            :highlight="q"
            :subtitle="f.target"
            :tags="f.tags"
            :meta="relTime(f.updatedAt)"
            :selected="i === sel"
            @select="sel = i"
            @activate="open(f)"
          >
            <template #trailing>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="editing = f"
              >
                {{ t("common.edit") }}
              </button>
              <button
                type="button"
                class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click.stop="deletingId = f.id"
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
      :title="editing ? t('favorite.edit') : t('favorite.addNew')"
      @close="closeForm"
      @submit="submitForm"
    >
      <Field :label="t('common.type')">
        <WhSelect v-model="fKind">
          <option value="link">{{ t("favorite.kindLink") }}</option>
          <option value="file">{{ t("favorite.kindFile") }}</option>
          <option value="folder">{{ t("favorite.kindFolder") }}</option>
          <option value="doc">{{ t("favorite.kindDoc") }}</option>
        </WhSelect>
      </Field>
      <Field :label="t('common.title')" required :error="errTitle">
        <WhInput
          v-model="fTitle"
          :placeholder="t('favorite.placeholderTitle')"
          autofocus
        />
      </Field>
      <Field :label="targetLabel" required :error="errTarget">
        <div class="flex gap-2">
          <WhInput
            v-model="fTarget"
            class="min-w-0 flex-1"
            :placeholder="targetPlaceholder"
          />
          <Button
            v-if="fKind === 'folder'"
            variant="secondary"
            type="button"
            @click.stop="pickTargetPath"
          >
            {{ t("favorite.pickDir") }}
          </Button>
          <Button
            v-else-if="fKind === 'file' || fKind === 'doc'"
            variant="secondary"
            type="button"
            @click.stop="pickTargetPath"
          >
            {{ t("favorite.pickFile") }}
          </Button>
        </div>
      </Field>
      <Field :label="t('common.tags')">
        <TagInput ref="tagInputRef" v-model="fTags" />
      </Field>
    </Modal>

    <ConfirmDialog
      :open="!!deletingId"
      :title="t('favorite.deleteTitle')"
      :description="t('favorite.deleteDesc')"
      :confirm-text="t('common.delete')"
      @cancel="deletingId = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
