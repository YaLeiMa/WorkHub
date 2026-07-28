<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "@/components/workhub/Button.vue";
import Card from "@/components/workhub/Card.vue";
import Field from "@/components/workhub/Field.vue";
import WhInput from "@/components/workhub/WhInput.vue";
import WhTextarea from "@/components/workhub/WhTextarea.vue";
import WhSelect from "@/components/workhub/WhSelect.vue";
import TagInput from "@/components/workhub/TagInput.vue";
import EmptyState from "@/components/workhub/EmptyState.vue";
import { navigate } from "@/lib/workhub/nav";
import { setStatusHint } from "@/lib/workhub/status";
import { toast } from "@/lib/workhub/toast";
import { projectsStore, getProject, projectGroupLabel } from "@/lib/workhub/projectsStore";
import { initWorkhubData } from "@/lib/workhub/init";
import { snippetsStore } from "@/lib/workhub/snippetsStore";
import { requestWorkflowRun } from "@/lib/workhub/workflowRunPrompt";
import {
  createWorkflow,
  getWorkflow,
  newWorkflowStep,
  updateWorkflow,
  workflowsStore,
  type WorkflowFormData,
} from "@/lib/workhub/workflowsStore";
import {
  getWorkflowRuns,
  loadWorkflowRuns,
} from "@/lib/workhub/workflowRunsStore";
import {
  normalizeWorkflowHotkey,
  validateWorkflowHotkey,
} from "@/lib/workhub/workflowHotkeys";
import type { WorkflowStep, WorkflowStepType } from "@/lib/workhub/types";

const props = defineProps<{ id: string }>();

const { t } = useI18n();
const isNew = computed(() => props.id === "new");
const existing = computed(() => (isNew.value ? undefined : getWorkflow(props.id)));

const fTitle = ref("");
const fDescription = ref("");
const fTags = ref<string[]>([]);
const fProjectId = ref("");
const fFavorite = ref(false);
const fHotkey = ref("");
const fSteps = ref<WorkflowStep[]>([]);
const errTitle = ref("");
const errHotkey = ref("");
/** initForm 回填表单时为 true，避免触发项目自动保存 */
let hydratingForm = false;

const stepTypes = computed(() =>
  (
    [
      "copy_snippet",
      "copy_text",
      "copy_project_command",
      "open_link",
      "open_project_link",
      "open_path",
      "open_vscode",
      "launch_app",
      "run_shell",
      "run_workflow",
      "delay",
      "notify",
    ] as WorkflowStepType[]
  ).map((type) => ({ type, label: t(`workflow.stepType.${type}`) })),
);

const boundProject = computed(() =>
  fProjectId.value ? getProject(fProjectId.value) : undefined,
);

const projectOptions = computed(() =>
  [...projectsStore.list].sort((a, b) => {
    const ga = projectGroupLabel(a.group);
    const gb = projectGroupLabel(b.group);
    return ga.localeCompare(gb, undefined, { sensitivity: "base" })
      || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  }),
);

const nestedWorkflowOptions = computed(() =>
  workflowsStore.list
    .filter((w) => w.id !== props.id)
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    ),
);

function projectOptionLabel(p: (typeof projectsStore.list)[number]) {
  const group = projectGroupLabel(p.group);
  return group ? `${group} / ${p.name}` : p.name;
}

const runHistory = computed(() =>
  isNew.value ? [] : getWorkflowRuns(props.id),
);

const expandedRunId = ref<string | null>(null);

function toggleRunExpand(runId: string) {
  expandedRunId.value = expandedRunId.value === runId ? null : runId;
}

function formatRunTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

watch(
  () => props.id,
  () => initForm(),
  { immediate: true },
);

watch(fProjectId, async (next, prev) => {
  if (hydratingForm || next === prev) return;
  if (isNew.value || !existing.value) return;
  if (next === (existing.value.projectId ?? "")) return;
  if (!fTitle.value.trim()) return;
  try {
    await updateWorkflow(props.id, buildFormData());
  } catch {
    toast.error(t("workflow.errors.saveFailed"));
  }
});

function initForm() {
  hydratingForm = true;
  const w = existing.value;
  fTitle.value = w?.title ?? "";
  fDescription.value = w?.description ?? "";
  fTags.value = w ? [...w.tags] : [];
  fProjectId.value = w?.projectId ?? "";
  fFavorite.value = w?.favorite ?? false;
  fHotkey.value = w?.hotkey ?? "";
  fSteps.value = w ? w.steps.map((s) => ({ ...s, config: { ...s.config } })) : [];
  errTitle.value = "";
  errHotkey.value = "";
  hydratingForm = false;
}

function addStep(type: WorkflowStepType) {
  fSteps.value.push(newWorkflowStep(type));
}

function removeStep(index: number) {
  fSteps.value.splice(index, 1);
}

function moveStep(index: number, delta: number) {
  const next = index + delta;
  if (next < 0 || next >= fSteps.value.length) return;
  const copy = [...fSteps.value];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  fSteps.value = copy;
}

function buildFormData(): WorkflowFormData {
  return {
    title: fTitle.value.trim(),
    description: fDescription.value.trim(),
    tags: [...fTags.value],
    projectId: fProjectId.value || undefined,
    favorite: fFavorite.value,
    hotkey: normalizeWorkflowHotkey(fHotkey.value) || undefined,
    steps: fSteps.value.map((s) => ({ ...s, config: { ...s.config } })),
  };
}

function validate() {
  errTitle.value = fTitle.value.trim() ? "" : t("common.required");
  const hotkey = normalizeWorkflowHotkey(fHotkey.value);
  if (!hotkey) {
    errHotkey.value = "";
  } else {
    const conflict = validateWorkflowHotkey(hotkey, isNew.value ? undefined : props.id);
    errHotkey.value =
      conflict === "conflict_app"
        ? t("workflow.errors.hotkeyConflictApp")
        : conflict === "conflict_workflow"
          ? t("workflow.errors.hotkeyConflictWorkflow")
          : "";
  }
  return !errTitle.value && !errHotkey.value;
}

async function save() {
  if (!validate()) return;
  const data = buildFormData();
  if (isNew.value) {
    const created = await createWorkflow(data);
    toast.success(t("workflow.saved"));
    navigate(`/workflows/${created.id}`);
  } else {
    await updateWorkflow(props.id, data);
    toast.success(t("workflow.saved"));
  }
}

async function runCurrent() {
  if (!validate()) return;
  const data = buildFormData();
  let workflowId = existing.value?.id ?? "preview";
  if (!isNew.value) {
    await updateWorkflow(props.id, data);
    workflowId = props.id;
    void loadWorkflowRuns(props.id);
  }
  const workflow = {
    id: workflowId,
    updatedAt: Date.now(),
    ...data,
  };
  await requestWorkflowRun(workflow);
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  e.preventDefault();
  e.stopPropagation();
  navigate("/workflows");
}

onMounted(async () => {
  setStatusHint("workflow.detail.statusHint");
  window.addEventListener("keydown", onKey);
  await initWorkhubData();
  initForm();
  if (!isNew.value) void loadWorkflowRuns(props.id);
});

watch(
  () => props.id,
  (id) => {
    if (id && id !== "new") void loadWorkflowRuns(id);
  },
);

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div v-if="!isNew && !existing" class="py-12">
    <EmptyState :title="t('workflow.notFound')" />
  </div>
  <div v-else class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <button
          type="button"
          class="mb-2 text-caption text-text-secondary hover:text-text"
          @click="navigate('/workflows')"
        >
          ← {{ t("workflow.back") }}
        </button>
        <h1 class="text-title text-text">
          {{ isNew ? t("workflow.add") : t("workflow.edit") }}
        </h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" @click="runCurrent">
          {{ t("workflow.run") }}
        </Button>
        <Button @click="save">{{ t("common.save") }}</Button>
      </div>
    </div>

    <Card :title="t('project.detail.basicInfo')" class="[&_section]:mb-0">
      <div class="flex flex-col gap-4">
      <Field :label="t('common.title')" :error="errTitle">
        <WhInput v-model="fTitle" />
      </Field>
      <Field :label="t('workflow.description')">
        <WhTextarea v-model="fDescription" rows="2" />
      </Field>
      <Field :label="t('common.tags')">
        <TagInput v-model="fTags" />
      </Field>
      <Field :label="t('workflow.bindProject')">
        <WhSelect v-model="fProjectId">
          <option value="">{{ t("workflow.noProject") }}</option>
          <option v-for="p in projectOptions" :key="p.id" :value="p.id">
            {{ projectOptionLabel(p) }}
          </option>
        </WhSelect>
        <p v-if="projectOptions.length === 0" class="mt-1 text-caption text-text-secondary">
          {{ t("workflow.noProjects") }}
        </p>
        <p v-else-if="boundProject" class="mt-1 text-caption text-text-secondary">
          {{ t("workflow.boundProjectPath", { path: boundProject.path }) }}
        </p>
        <p v-else class="mt-1 text-caption text-text-secondary">
          {{ t("workflow.bindProjectHint") }}
        </p>
      </Field>
      <Field
        :label="t('workflow.hotkey')"
        :hint="t('workflow.hotkeyHint')"
        :error="errHotkey"
      >
        <WhInput
          v-model="fHotkey"
          :placeholder="t('workflow.hotkeyPlaceholder')"
        />
      </Field>
      </div>
    </Card>

    <div class="flex items-center justify-between gap-2">
      <h2 class="text-section text-text">{{ t("workflow.steps") }}</h2>
      <div class="flex flex-wrap gap-1">
        <Button
          v-for="st in stepTypes"
          :key="st.type"
          variant="secondary"
          @click="addStep(st.type)"
        >
          + {{ st.label }}
        </Button>
      </div>
    </div>

    <EmptyState
      v-if="fSteps.length === 0"
      :title="t('workflow.noSteps')"
      :description="t('workflow.noStepsDesc')"
    />

    <Card
      v-for="(step, index) in fSteps"
      :key="step.id"
      :title="`${index + 1}. ${t(`workflow.stepType.${step.type}`)}`"
      class="[&_section]:mb-0"
    >
      <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <div class="flex gap-1">
          <Button variant="text" :disabled="index === 0" @click="moveStep(index, -1)">↑</Button>
          <Button variant="text" :disabled="index === fSteps.length - 1" @click="moveStep(index, 1)">↓</Button>
          <Button variant="text" @click="removeStep(index)">{{ t("common.delete") }}</Button>
        </div>
      </div>

      <Field :label="t('workflow.stepTitle')">
        <WhInput
          :model-value="step.title ?? ''"
          :placeholder="t(`workflow.stepType.${step.type}`)"
          @update:model-value="step.title = $event || undefined"
        />
      </Field>

      <Field :label="t('workflow.parallelGroup')">
        <WhInput
          :model-value="step.parallelGroup != null ? String(step.parallelGroup) : ''"
          type="number"
          min="1"
          :placeholder="t('workflow.parallelGroupHint')"
          @update:model-value="
            step.parallelGroup = $event ? Number($event) : undefined
          "
        />
      </Field>

      <template v-if="step.type === 'copy_snippet'">
        <Field :label="t('workflow.config.snippet')">
          <select
            :value="String(step.config.snippetId ?? '')"
            class="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-body"
            @change="step.config.snippetId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">{{ t("workflow.config.chooseSnippet") }}</option>
            <option v-for="s in snippetsStore.list" :key="s.id" :value="s.id">
              {{ s.title }}
            </option>
          </select>
        </Field>
      </template>

      <template v-else-if="step.type === 'copy_text'">
        <Field :label="t('workflow.config.text')">
          <WhTextarea
            :model-value="String(step.config.text ?? '')"
            rows="3"
            @update:model-value="step.config.text = $event"
          />
        </Field>
      </template>

      <template v-else-if="step.type === 'copy_project_command'">
        <Field :label="t('workflow.config.projectCommand')">
          <select
            :value="String(step.config.commandId ?? '')"
            class="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-body"
            @change="step.config.commandId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">{{ t("workflow.config.chooseCommand") }}</option>
            <option
              v-for="c in boundProject?.commands ?? []"
              :key="c.id"
              :value="c.id"
            >
              {{ c.title || c.command }}
            </option>
          </select>
        </Field>
        <p v-if="!fProjectId" class="text-caption text-text-secondary">
          {{ t("workflow.config.needProject") }}
        </p>
      </template>

      <template v-else-if="step.type === 'open_project_link'">
        <Field :label="t('workflow.config.projectLink')">
          <select
            :value="String(step.config.linkId ?? '')"
            class="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-body"
            @change="step.config.linkId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">{{ t("workflow.config.chooseLink") }}</option>
            <option
              v-for="l in boundProject?.links ?? []"
              :key="l.id"
              :value="l.id"
            >
              {{ l.title }}
            </option>
          </select>
        </Field>
      </template>

      <template v-else-if="step.type === 'open_link'">
        <Field :label="t('workflow.config.url')">
          <WhInput
            :model-value="String(step.config.url ?? '')"
            @update:model-value="step.config.url = $event"
          />
        </Field>
      </template>

      <template v-else-if="step.type === 'open_path' || step.type === 'open_vscode'">
        <label class="flex items-center gap-2 text-body text-text">
          <input
            :checked="!!step.config.useProjectPath"
            type="checkbox"
            class="rounded"
            @change="step.config.useProjectPath = ($event.target as HTMLInputElement).checked"
          />
          {{ t("workflow.config.useProjectPath") }}
        </label>
        <Field v-if="!step.config.useProjectPath" :label="t('workflow.config.path')">
          <WhInput
            :model-value="String(step.config.path ?? '')"
            @update:model-value="step.config.path = $event"
          />
        </Field>
      </template>

      <template v-else-if="step.type === 'launch_app'">
        <Field :label="t('workflow.config.appTarget')">
          <WhInput
            :model-value="String(step.config.target ?? '')"
            @update:model-value="step.config.target = $event"
          />
        </Field>
        <Field :label="t('workflow.config.appTitle')">
          <WhInput
            :model-value="String(step.config.title ?? '')"
            @update:model-value="step.config.title = $event"
          />
        </Field>
      </template>

      <template v-else-if="step.type === 'delay'">
        <Field :label="t('workflow.config.delayMs')">
          <WhInput
            :model-value="String(step.config.ms ?? 500)"
            type="number"
            min="0"
            @update:model-value="step.config.ms = Number($event) || 0"
          />
        </Field>
      </template>

      <template v-else-if="step.type === 'run_shell'">
        <Field :label="t('workflow.config.command')">
          <WhTextarea
            :model-value="String(step.config.command ?? '')"
            rows="2"
            :placeholder="t('workflow.config.commandPlaceholder')"
            @update:model-value="step.config.command = $event"
          />
        </Field>
        <label class="flex items-center gap-2 text-body text-text">
          <input
            :checked="!!step.config.useProjectPath"
            type="checkbox"
            class="rounded"
            @change="step.config.useProjectPath = ($event.target as HTMLInputElement).checked"
          />
          {{ t("workflow.config.useProjectPath") }}
        </label>
        <label class="flex items-center gap-2 text-body text-text">
          <input
            :checked="step.config.copyOutput !== false"
            type="checkbox"
            class="rounded"
            @change="step.config.copyOutput = ($event.target as HTMLInputElement).checked"
          />
          {{ t("workflow.config.copyOutput") }}
        </label>
        <p class="text-caption text-text-secondary">{{ t("workflow.config.shellHint") }}</p>
      </template>

      <template v-else-if="step.type === 'run_workflow'">
        <Field :label="t('workflow.config.nestedWorkflow')">
          <WhSelect
            :model-value="String(step.config.workflowId ?? '')"
            @update:model-value="step.config.workflowId = $event"
          >
            <option value="">{{ t("workflow.config.chooseWorkflow") }}</option>
            <option
              v-for="w in nestedWorkflowOptions"
              :key="w.id"
              :value="w.id"
            >
              {{ w.title }}
            </option>
          </WhSelect>
          <p
            v-if="nestedWorkflowOptions.length === 0"
            class="mt-1 text-caption text-text-secondary"
          >
            {{ t("workflow.config.noOtherWorkflows") }}
          </p>
        </Field>
        <p class="text-caption text-text-secondary">{{ t("workflow.config.nestedHint") }}</p>
      </template>

      <template v-else-if="step.type === 'notify'">
        <Field :label="t('workflow.config.message')">
          <WhInput
            :model-value="String(step.config.message ?? '')"
            @update:model-value="step.config.message = $event"
          />
        </Field>
      </template>
      </div>
    </Card>

    <div v-if="!isNew" class="flex flex-col gap-2">
      <h2 class="text-section text-text">{{ t("workflow.runs.title") }}</h2>
      <EmptyState
        v-if="runHistory.length === 0"
        :title="t('workflow.runs.empty')"
        :description="t('workflow.runs.emptyDesc')"
      />
      <div
        v-for="run in runHistory"
        :key="run.id"
        class="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-card"
      >
        <button
          type="button"
          class="flex w-full items-start justify-between gap-3 text-left"
          @click="toggleRunExpand(run.id)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded px-2 py-0.5 text-caption"
                :class="
                  run.status === 'success'
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                "
              >
                {{
                  run.status === "success"
                    ? t("workflow.runs.success")
                    : t("workflow.runs.failed")
                }}
              </span>
              <span
                v-if="run.dryRun"
                class="rounded bg-surface-elevated px-2 py-0.5 text-caption text-text-secondary"
              >
                {{ t("workflow.runs.dryRun") }}
              </span>
              <span class="text-caption text-text-secondary">
                {{ formatRunTime(run.startedAt) }}
              </span>
              <span class="text-caption text-text-secondary">
                {{ formatDuration(run.durationMs) }}
              </span>
            </div>
            <p v-if="run.errorMessage" class="mt-1 truncate text-caption text-danger">
              {{ run.errorMessage }}
            </p>
          </div>
          <span class="text-caption text-text-secondary">
            {{ expandedRunId === run.id ? "▾" : "▸" }}
          </span>
        </button>
        <ul
          v-if="expandedRunId === run.id"
          class="mt-3 flex flex-col gap-1 border-t border-border pt-3"
        >
          <li
            v-for="(stepLog, si) in run.stepsLog"
            :key="`${run.id}-${stepLog.stepId}-${si}`"
            class="flex flex-wrap items-baseline gap-2 text-body"
          >
            <span
              class="text-caption"
              :class="stepLog.status === 'success' ? 'text-success' : 'text-danger'"
            >
              {{ stepLog.status === "success" ? "✓" : "✗" }}
            </span>
            <span class="text-text">{{ stepLog.title }}</span>
            <span class="text-caption text-text-secondary">
              {{ t(`workflow.stepType.${stepLog.type}`) }}
            </span>
            <span class="text-caption text-text-secondary">
              {{ formatDuration(stepLog.durationMs) }}
            </span>
            <pre
              v-if="stepLog.message"
              class="mt-1 w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-elevated px-2 py-1 text-caption text-text-secondary"
            >{{ stepLog.message }}</pre>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
