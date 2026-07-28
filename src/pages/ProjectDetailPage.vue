<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { t } from "@/i18n";
import Button from "@/components/workhub/Button.vue";
import ResultItem from "@/components/workhub/ResultItem.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import Card from "@/components/workhub/Card.vue";
import Modal from "@/components/workhub/Modal.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import WhTextarea from "@/components/workhub/WhTextarea.vue";
import {
  addProjectCommand,
  addProjectDoc,
  addProjectLink,
  deleteProjectCommand,
  deleteProjectDoc,
  deleteProjectLink,
  getProject,
  projectGroupLabel,
  updateProjectCommand,
  updateProjectLink,
} from "@/lib/workhub/projectsStore";
import { setStatusHint } from "@/lib/workhub/status";
import { navigate } from "@/lib/workhub/nav";
import {
  copyText,
  openFile,
  openProject,
  openUrl,
  pickDocument,
} from "@/lib/workhub/actions";
import {
  fetchGitStatus,
  gitStatusStore,
} from "@/lib/workhub/gitStatus";
import { gitCompareUrl } from "@/lib/workhub/gitUrls";
import { isShellExecutionAllowed } from "@/lib/workhub/settingsStore";
import { inTauri } from "@/lib/workhub/db";
import { toast } from "@/lib/workhub/toast";

const { t: $t } = useI18n();

const props = defineProps<{ id: string }>();

const project = computed(() => getProject(props.id));

const gitStatus = computed(() =>
  project.value ? gitStatusStore.byProjectId[project.value.id] : undefined,
);

const gitQuickCommands = [
  { id: "status", command: "git status" },
  { id: "pull", command: "git pull" },
  { id: "fetch", command: "git fetch" },
  { id: "push", command: "git push" },
  { id: "stash", command: "git stash push -m \"WIP\"" },
  { id: "log", command: "git log -5 --oneline" },
] as const;

const prCompareUrl = computed(() => {
  const p = project.value;
  const branch = gitStatus.value?.branch;
  if (!p?.gitUrl || !branch) return null;
  return gitCompareUrl(p.gitUrl, branch);
});

async function refreshGit() {
  const p = project.value;
  if (!p?.path) return;
  await fetchGitStatus(p.id, p.path);
}

async function onGitCommand(e: MouseEvent, command: string) {
  if (e.ctrlKey || e.metaKey) {
    await runGitCommand(command);
    return;
  }
  await copyText(command, $t("toast.copied"));
}

async function runGitCommand(command: string) {
  const p = project.value;
  if (!p?.path) return;
  if (!inTauri()) {
    toast.error($t("project.detail.gitShellDesktopOnly"));
    return;
  }
  if (!(await isShellExecutionAllowed())) {
    toast.error($t("project.detail.gitShellDisabled"));
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exitCode: number;
      stdout: string;
      stderr: string;
      success: boolean;
    }>("run_shell_command", {
      command,
      cwd: p.path,
      timeoutMs: 120_000,
    });
    const output = (result.stdout.trim() || result.stderr.trim());
    if (output) {
      await copyText(output, $t("project.detail.gitOutputCopied"));
    } else if (result.success) {
      toast.success($t("project.detail.gitCommandDone"));
    } else {
      toast.error($t("project.detail.gitCommandFailed", { code: result.exitCode }));
    }
    await refreshGit();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(msg);
  }
}

function openPrCompare() {
  const url = prCompareUrl.value;
  if (!url) return;
  void openUrl(url, {
    kind: "link",
    refId: project.value!.id,
    title: $t("project.detail.gitOpenPr"),
    subtitle: url,
  });
}

watch(
  () => project.value?.path,
  (path) => {
    if (project.value && path) void fetchGitStatus(project.value.id, path);
  },
  { immediate: true },
);

onMounted(() => {
  setStatusHint("project.detail.statusHint");
});

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  e.preventDefault();
  e.stopPropagation();
  navigate("/projects");
}

/* ---------- 链接 ---------- */
const linkFormOpen = ref(false);
const editingLinkId = ref<string | null>(null);
const fLinkTitle = ref("");
const fLinkUrl = ref("");
const errLinkTitle = ref("");
const errLinkUrl = ref("");

watch(linkFormOpen, (open) => {
  if (!open) return;
  const link = editingLinkId.value
    ? project.value?.links.find((l) => l.id === editingLinkId.value)
    : null;
  fLinkTitle.value = link?.title ?? "";
  fLinkUrl.value = link?.url ?? "";
  errLinkTitle.value = "";
  errLinkUrl.value = "";
});

function openLinkForm(linkId?: string) {
  editingLinkId.value = linkId ?? null;
  linkFormOpen.value = true;
}

function closeLinkForm() {
  linkFormOpen.value = false;
  editingLinkId.value = null;
}

function submitLinkForm() {
  if (!project.value) return;
  errLinkTitle.value = fLinkTitle.value.trim() ? "" : t("project.detail.errLinkName");
  errLinkUrl.value = fLinkUrl.value.trim() ? "" : t("project.detail.errLinkUrl");
  if (errLinkTitle.value || errLinkUrl.value) return;

  const data = { title: fLinkTitle.value.trim(), url: fLinkUrl.value.trim() };
  if (editingLinkId.value) {
    updateProjectLink(project.value.id, editingLinkId.value, data);
    toast.success(t("project.detail.linkUpdated"));
  } else {
    addProjectLink(project.value.id, data);
    toast.success(t("project.detail.linkAdded"));
  }
  closeLinkForm();
}

const deletingLinkId = ref<string | null>(null);

function confirmDeleteLink() {
  if (project.value && deletingLinkId.value) {
    deleteProjectLink(project.value.id, deletingLinkId.value);
    toast.success(t("project.detail.linkDeleted"));
  }
  deletingLinkId.value = null;
}

/* ---------- 命令 ---------- */
const commandFormOpen = ref(false);
const editingCommandId = ref<string | null>(null);
const fCmdTitle = ref("");
const fCmdText = ref("");
const errCmdText = ref("");

watch(commandFormOpen, (open) => {
  if (!open) return;
  const cmd = editingCommandId.value
    ? project.value?.commands.find((c) => c.id === editingCommandId.value)
    : null;
  fCmdTitle.value = cmd?.title ?? "";
  fCmdText.value = cmd?.command ?? "";
  errCmdText.value = "";
});

function openCommandForm(commandId?: string) {
  editingCommandId.value = commandId ?? null;
  commandFormOpen.value = true;
}

function closeCommandForm() {
  commandFormOpen.value = false;
  editingCommandId.value = null;
}

function submitCommandForm() {
  if (!project.value) return;
  errCmdText.value = fCmdText.value.trim() ? "" : t("project.detail.errCommand");
  if (errCmdText.value) return;

  const title = fCmdTitle.value.trim() || fCmdText.value.trim().split("\n")[0];
  const data = { title, command: fCmdText.value.trim() };
  if (editingCommandId.value) {
    updateProjectCommand(project.value.id, editingCommandId.value, data);
    toast.success(t("project.detail.commandUpdated"));
  } else {
    addProjectCommand(project.value.id, data);
    toast.success(t("project.detail.commandAdded"));
  }
  closeCommandForm();
}

const deletingCommandId = ref<string | null>(null);

function confirmDeleteCommand() {
  if (project.value && deletingCommandId.value) {
    deleteProjectCommand(project.value.id, deletingCommandId.value);
    toast.success(t("project.detail.commandDeleted"));
  }
  deletingCommandId.value = null;
}

/* ---------- 文档 ---------- */
const docFormOpen = ref(false);
const fDocTitle = ref("");
const fDocPath = ref("");
const errDocPath = ref("");

watch(docFormOpen, (open) => {
  if (!open) return;
  fDocTitle.value = "";
  fDocPath.value = "";
  errDocPath.value = "";
});

function closeDocForm() {
  docFormOpen.value = false;
}

async function pickDocFile() {
  const path = await pickDocument();
  if (!path) return;
  fDocPath.value = path;
  if (!fDocTitle.value.trim()) {
    const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
    fDocTitle.value = name;
  }
}

function submitDocForm() {
  if (!project.value) return;
  errDocPath.value = fDocPath.value.trim() ? "" : t("project.detail.errDocPath");
  if (errDocPath.value) return;

  const path = fDocPath.value.trim();
  const title = fDocTitle.value.trim() || path.replace(/\\/g, "/").split("/").pop() || t("project.detail.unnamed");
  addProjectDoc(project.value.id, { title, path });
  toast.success(t("project.detail.docAdded"));
  closeDocForm();
}

const deletingDocId = ref<string | null>(null);

function confirmDeleteDoc() {
  if (project.value && deletingDocId.value) {
    deleteProjectDoc(project.value.id, deletingDocId.value);
    toast.success(t("project.detail.docDeleted"));
  }
  deletingDocId.value = null;
}
</script>

<template>
  <EmptyState
    v-if="!project"
    :title="$t('project.detail.notFound')"
  >
    <template #action>
      <Button @click="navigate('/projects')">{{ $t('project.detail.back') }}</Button>
    </template>
  </EmptyState>

  <div v-else class="outline-none" tabindex="-1" @keydown="onKey">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-caption text-text-secondary hover:text-text"
          @click="navigate('/projects')"
        >
          ← {{ $t('project.detail.backShort') }}
        </button>
        <span class="text-caption text-text-placeholder">/</span>
        <span class="text-caption text-text-secondary">{{ project.name }}</span>
      </div>
      <Button
        variant="primary"
        @click="
          openProject(project.path, project.name, {
            kind: 'project',
            refId: project.id,
            title: project.name,
            subtitle: project.path,
          })
        "
      >
        {{ $t('project.detail.quickStart') }}
      </Button>
    </div>

    <Card :title="$t('project.detail.basicInfo')">
      <div class="grid grid-cols-[88px_1fr] gap-y-2 text-body">
        <div class="text-text-secondary">{{ $t('project.detail.name') }}</div>
        <div class="text-text">{{ project.name }}</div>
        <div class="text-text-secondary">{{ $t('project.detail.description') }}</div>
        <div class="text-text">{{ project.description || "—" }}</div>
        <div class="text-text-secondary">{{ $t('project.detail.group') }}</div>
        <div class="text-text">{{ projectGroupLabel(project.group) }}</div>
        <div class="text-text-secondary">{{ $t('project.detail.path') }}</div>
        <div class="text-mono break-all text-text">{{ project.path }}</div>
        <div class="text-text-secondary">{{ $t('project.detail.gitUrl') }}</div>
        <div class="min-w-0">
          <button
            v-if="project.gitUrl"
            type="button"
            class="text-mono break-all text-primary hover:underline"
            @click="
              openUrl(project.gitUrl, {
                kind: 'link',
                refId: project.id,
                title: project.name,
                subtitle: project.gitUrl,
              })
            "
          >
            {{ project.gitUrl }}
          </button>
          <span v-else class="text-text-placeholder">—</span>
        </div>
        <div class="text-text-secondary">{{ $t('project.detail.tags') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <span v-if="project.tags.length === 0" class="text-text-placeholder">—</span>
          <span
            v-for="tag in project.tags"
            :key="tag"
            class="rounded-[var(--radius-sm)] bg-surface-hover px-1.5 py-0.5 text-caption text-text-secondary"
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </Card>

    <Card :title="$t('project.detail.git')">
      <div v-if="!gitStatus?.hasRepo" class="text-body text-text-placeholder">
        {{ $t('project.detail.gitNoRepo') }}
      </div>
      <div v-else class="flex flex-col gap-3">
        <div class="grid grid-cols-[88px_1fr] gap-y-2 text-body">
          <div class="text-text-secondary">{{ $t('project.detail.gitBranch') }}</div>
          <div class="text-mono text-text">{{ gitStatus.branch ?? "—" }}</div>
          <div class="text-text-secondary">{{ $t('project.detail.gitStatus') }}</div>
          <div class="text-text">
            {{ gitStatus.isDirty ? $t('project.gitDirty') : $t('project.gitClean') }}
          </div>
        </div>
        <div>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="text-caption text-text-secondary">
              {{ $t('project.detail.gitQuickCopy') }}
            </div>
            <div class="flex flex-wrap gap-2">
              <Button variant="text" @click="refreshGit()">
                {{ $t('project.detail.gitRefresh') }}
              </Button>
              <Button
                v-if="prCompareUrl"
                variant="text"
                @click="openPrCompare()"
              >
                {{ $t('project.detail.gitOpenPr') }}
              </Button>
            </div>
          </div>
          <p class="mb-2 text-caption text-text-placeholder">
            {{ $t('project.detail.gitActionHint') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="item in gitQuickCommands"
              :key="item.id"
              variant="secondary"
              @click="onGitCommand($event, item.command)"
            >
              {{ item.command }}
            </Button>
          </div>
        </div>
      </div>
    </Card>

    <Card :title="$t('project.detail.links')" :action="$t('project.detail.manageLinks')" @action="openLinkForm">
      <div v-if="project.links.length === 0" class="flex flex-col items-start gap-2 py-2">
        <span class="text-body text-text-placeholder">{{ $t('project.detail.noLinks') }}</span>
        <Button variant="text" @click="openLinkForm()">{{ $t('project.detail.addLink') }}</Button>
      </div>
      <div v-else class="flex flex-col gap-1">
        <ResultItem
          v-for="l in project.links"
          :key="l.id"
          kind="link"
          :title="l.title"
          :subtitle="l.url"
          @select="
            openUrl(l.url, {
              kind: 'link',
              refId: l.id,
              title: l.title,
              subtitle: l.url,
            })
          "
        >
          <template #trailing>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="openLinkForm(l.id)"
            >
              {{ $t('common.edit') }}
            </button>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="deletingLinkId = l.id"
            >
              {{ $t('common.delete') }}
            </button>
          </template>
        </ResultItem>
      </div>
    </Card>

    <Card :title="$t('project.detail.commands')" :action="$t('project.detail.manageCommands')" @action="openCommandForm">
      <div v-if="project.commands.length === 0" class="flex flex-col items-start gap-2 py-2">
        <span class="text-body text-text-placeholder">{{ $t('project.detail.noCommands') }}</span>
        <Button variant="text" @click="openCommandForm()">{{ $t('project.detail.addCommand') }}</Button>
      </div>
      <div v-else class="flex flex-col gap-1">
        <ResultItem
          v-for="c in project.commands"
          :key="c.id"
          kind="command"
          :title="c.title"
          :subtitle="c.command"
          @select="
            copyText(c.command, t('toast.commandCopied'), {
              kind: 'command',
              refId: c.id,
              title: c.title,
              subtitle: c.command,
            })
          "
        >
          <template #trailing>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="openCommandForm(c.id)"
            >
              {{ $t('common.edit') }}
            </button>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="deletingCommandId = c.id"
            >
              {{ $t('common.delete') }}
            </button>
          </template>
        </ResultItem>
      </div>
    </Card>

    <Card :title="$t('project.detail.docs')" :action="$t('project.detail.addDoc')" @action="docFormOpen = true">
      <div v-if="project.docs.length === 0" class="flex flex-col items-start gap-2 py-2">
        <span class="text-body text-text-placeholder">{{ $t('project.detail.noDocs') }}</span>
        <Button variant="text" @click="docFormOpen = true">{{ $t('project.detail.addDoc') }}</Button>
      </div>
      <div v-else class="flex flex-col gap-1">
        <ResultItem
          v-for="d in project.docs"
          :key="d.id"
          kind="doc"
          :title="d.title"
          :subtitle="d.path"
          @select="
            openFile(d.path, t('toast.opened'), {
              kind: 'doc',
              refId: d.id,
              title: d.title,
              subtitle: d.path,
            })
          "
        >
          <template #trailing>
            <button
              type="button"
              class="h-7 shrink-0 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
              @click.stop="deletingDocId = d.id"
            >
              {{ $t('common.delete') }}
            </button>
          </template>
        </ResultItem>
      </div>
    </Card>

    <Modal
      :open="linkFormOpen"
      :title="editingLinkId ? $t('project.detail.editLink') : $t('project.detail.newLink')"
      @close="closeLinkForm"
      @submit="submitLinkForm"
    >
      <Field :label="$t('project.detail.linkName')" required :error="errLinkTitle">
        <WhInput v-model="fLinkTitle" :placeholder="$t('project.detail.linkNamePlaceholder')" autofocus />
      </Field>
      <Field :label="$t('project.detail.linkUrl')" required :error="errLinkUrl">
        <WhInput v-model="fLinkUrl" placeholder="https://..." />
      </Field>
    </Modal>

    <Modal
      :open="commandFormOpen"
      :title="editingCommandId ? $t('project.detail.editCommand') : $t('project.detail.newCommand')"
      @close="closeCommandForm"
      @submit="submitCommandForm"
    >
      <Field :label="$t('project.detail.commandName')">
        <WhInput v-model="fCmdTitle" :placeholder="$t('project.detail.commandNamePlaceholder')" />
      </Field>
      <Field :label="$t('project.detail.commandContent')" required :error="errCmdText">
        <WhTextarea v-model="fCmdText" placeholder="npm run dev" :rows="4" />
      </Field>
    </Modal>

    <Modal
      :open="docFormOpen"
      :title="$t('project.detail.newDoc')"
      @close="closeDocForm"
      @submit="submitDocForm"
    >
      <Field :label="$t('project.detail.docName')">
        <WhInput v-model="fDocTitle" :placeholder="$t('project.detail.docNamePlaceholder')" autofocus />
      </Field>
      <Field :label="$t('project.detail.docPath')" required :error="errDocPath">
        <div class="flex gap-2">
          <WhInput v-model="fDocPath" class="min-w-0 flex-1" :placeholder="$t('project.detail.docPathPlaceholder')" />
          <Button variant="secondary" type="button" @click.stop="pickDocFile">{{ $t('project.detail.pickFile') }}</Button>
        </div>
      </Field>
    </Modal>

    <ConfirmDialog
      :open="!!deletingLinkId"
      :title="$t('project.detail.deleteLink')"
      :description="$t('project.detail.deleteLinkDesc')"
      :confirm-text="$t('common.delete')"
      @cancel="deletingLinkId = null"
      @confirm="confirmDeleteLink"
    />

    <ConfirmDialog
      :open="!!deletingCommandId"
      :title="$t('project.detail.deleteCommand')"
      :description="$t('project.detail.deleteCommandDesc')"
      :confirm-text="$t('common.delete')"
      @cancel="deletingCommandId = null"
      @confirm="confirmDeleteCommand"
    />

    <ConfirmDialog
      :open="!!deletingDocId"
      :title="$t('project.detail.deleteDoc')"
      :description="$t('project.detail.deleteDocDesc')"
      :confirm-text="$t('common.delete')"
      @cancel="deletingDocId = null"
      @confirm="confirmDeleteDoc"
    />
  </div>
</template>
