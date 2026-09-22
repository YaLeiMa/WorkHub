import { t } from "@/i18n";
import {
  copyText,
  launchApp,
  openFile,
  openProject,
  openUrl,
  type RecentMeta,
} from "./actions";
import { getProject } from "./projectsStore";
import { getSnippet } from "./snippetsStore";
import { getWorkflow } from "./workflowsStore";
import { gitReleaseUrl } from "./gitUrls";
import { recordRecent } from "./recentStore";
import { isShellExecutionAllowed } from "./settingsStore";
import { toast } from "./toast";
import { applySnippetVariables } from "./snippetVariables";
import type { Workflow, WorkflowStep } from "./types";
import { inTauri } from "./db";
import {
  appendWorkflowStepLog,
  createWorkflowRunContext,
  persistWorkflowRun,
  type WorkflowStepLog,
} from "./workflowRunsStore";

let runningWorkflowId: string | null = null;

export class WorkflowRunError extends Error {
  constructor(
    message: string,
    public stepId: string,
    public stepTitle?: string,
  ) {
    super(message);
    this.name = "WorkflowRunError";
  }
}

function interpolate(
  raw: string,
  workflow: Workflow,
  variables: Record<string, string>,
): string {
  const project = workflow.projectId
    ? getProject(workflow.projectId)
    : undefined;
  let out = applySnippetVariables(raw, variables);
  return out
    .replace(/\{\{project\.path\}\}/g, project?.path ?? "")
    .replace(/\{\{project\.name\}\}/g, project?.name ?? "")
    .replace(/\{\{project\.gitUrl\}\}/g, project?.gitUrl ?? "")
    .replace(/\{\{project\.releasesUrl\}\}/g, gitReleaseUrl(project?.gitUrl ?? "") ?? "");
}

function resolveProjectPath(
  workflow: Workflow,
  config: Record<string, unknown>,
  variables: Record<string, string>,
): string {
  if (config.useProjectPath) {
    const project = workflow.projectId ? getProject(workflow.projectId) : undefined;
    if (!project?.path) {
      throw new WorkflowRunError(t("workflow.errors.noProjectPath"), "");
    }
    return project.path;
  }
  const path = String(config.path ?? "").trim();
  return interpolate(path, workflow, variables);
}

function stepLabel(step: WorkflowStep): string {
  return step.title || t(`workflow.stepType.${step.type}`);
}

/** 子工作流未绑项目时，继承父工作流的项目上下文 */
function withInheritedProject(
  child: Workflow,
  parent: Workflow,
): Workflow {
  if (child.projectId || !parent.projectId) return child;
  return { ...child, projectId: parent.projectId };
}

function requireProject(workflow: Workflow, step: WorkflowStep) {
  const project = workflow.projectId ? getProject(workflow.projectId) : undefined;
  if (!project) {
    throw new WorkflowRunError(
      t("workflow.errors.noProjectBound"),
      step.id,
      stepLabel(step),
    );
  }
  return project;
}

async function runShellStep(
  workflow: Workflow,
  step: WorkflowStep,
  cfg: Record<string, unknown>,
  variables: Record<string, string>,
): Promise<string | undefined> {
  if (!(await isShellExecutionAllowed())) {
    throw new WorkflowRunError(t("workflow.errors.shellDisabled"), step.id, stepLabel(step));
  }
  if (!inTauri()) {
    throw new WorkflowRunError(t("workflow.errors.shellDesktopOnly"), step.id, stepLabel(step));
  }
  const command = interpolate(String(cfg.command ?? ""), workflow, variables);
  if (!command.trim()) {
    throw new WorkflowRunError(t("workflow.errors.emptyCommand"), step.id, stepLabel(step));
  }
  const cwd = cfg.useProjectPath
    ? resolveProjectPath(workflow, cfg, variables)
    : interpolate(String(cfg.cwd ?? ""), workflow, variables) || undefined;
  const background = cfg.background === true;
  // 列表里显示的名称：「工作流名 · 步骤标题」，步骤没写标题就只用工作流名
  const stepTitle = (step.title ?? "").trim();
  const runName = stepTitle ? `${workflow.title} · ${stepTitle}` : workflow.title;
  const { invoke } = await import("@tauri-apps/api/core");
  let result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    success: boolean;
    background?: boolean;
    runId?: string | null;
    pid?: number | null;
    logPath?: string | null;
  };
  try {
    result = await invoke("run_shell_command", {
      command,
      cwd: cwd || null,
      timeoutMs: Number(cfg.timeoutMs ?? 30_000),
      background,
      name: runName,
    });
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : t("workflow.errors.stepFailed");
    throw new WorkflowRunError(msg, step.id, stepLabel(step));
  }

  // 后台常驻：进程已托管在 Rust 侧，可在工作流页「后台命令」里停止
  if (result.background) {
    const { refreshShellRuns } = await import("./shellRuns");
    await refreshShellRuns();
    const pid = String(result.pid ?? "?");
    toast.success(t("workflow.background.started", { pid }));
    return t("workflow.background.running", { command });
  }

  if (!result.success && !step.continueOnError) {
    throw new WorkflowRunError(
      result.stderr.trim() || t("workflow.errors.shellExit", { code: result.exitCode }),
      step.id,
      stepLabel(step),
    );
  }

  const output = (result.stdout.trim() || result.stderr.trim());
  const copyOutput = cfg.copyOutput !== false;
  const showOutput = cfg.showOutput !== false;

  if (output) {
    if (copyOutput) {
      await copyText(output, t("workflow.shellOutputCopied"));
    } else if (showOutput) {
      const firstLine = output.split(/\r?\n/).find((l) => l.trim()) ?? output;
      const preview =
        firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
      toast.success(t("workflow.shellPreview", { preview }));
    }
    return output.length > 800 ? `${output.slice(0, 800)}…` : output;
  }

  if (showOutput) {
    toast.info(t("workflow.shellNoOutput"));
  }
  return undefined;
}

async function runStep(
  workflow: Workflow,
  step: WorkflowStep,
  variables: Record<string, string>,
  options: RunWorkflowOptions,
): Promise<string | undefined> {
  const cfg = step.config;
  switch (step.type) {
    case "copy_snippet": {
      const snippetId = String(cfg.snippetId ?? "");
      const snippet = getSnippet(snippetId);
      if (!snippet) {
        throw new WorkflowRunError(t("workflow.errors.snippetMissing"), step.id, stepLabel(step));
      }
      const text = interpolate(snippet.code, workflow, variables);
      await copyText(text, t("toast.copied"), {
        kind: "snippet",
        refId: snippet.id,
        title: snippet.title,
      });
      return;
    }
    case "copy_text": {
      const text = interpolate(String(cfg.text ?? ""), workflow, variables);
      if (!text.trim()) {
        throw new WorkflowRunError(t("workflow.errors.emptyText"), step.id, stepLabel(step));
      }
      await copyText(text, t("toast.copied"));
      return;
    }
    case "copy_project_command": {
      const project = requireProject(workflow, step);
      const cmdId = String(cfg.commandId ?? "");
      const cmd = project.commands.find((c) => c.id === cmdId);
      if (!cmd) {
        throw new WorkflowRunError(t("workflow.errors.projectCommandMissing"), step.id, stepLabel(step));
      }
      const text = interpolate(cmd.command, workflow, variables);
      await copyText(text, t("toast.commandCopied"), {
        kind: "command",
        refId: cmd.id,
        title: cmd.title,
      });
      return;
    }
    case "open_link": {
      const url = interpolate(String(cfg.url ?? ""), workflow, variables);
      if (!url.trim()) {
        throw new WorkflowRunError(t("workflow.errors.emptyUrl"), step.id, stepLabel(step));
      }
      await openUrl(url);
      return;
    }
    case "open_project_link": {
      const project = requireProject(workflow, step);
      const linkId = String(cfg.linkId ?? "");
      const link = project.links.find((l) => l.id === linkId);
      if (!link) {
        throw new WorkflowRunError(t("workflow.errors.projectLinkMissing"), step.id, stepLabel(step));
      }
      await openUrl(link.url, {
        kind: "link",
        refId: link.id,
        title: link.title,
        subtitle: link.url,
      });
      return;
    }
    case "open_path": {
      const path = resolveProjectPath(workflow, cfg, variables);
      if (!path.trim()) {
        throw new WorkflowRunError(t("workflow.errors.emptyPath"), step.id, stepLabel(step));
      }
      await openFile(path);
      return;
    }
    case "open_vscode": {
      const path = resolveProjectPath(workflow, cfg, variables);
      if (!path.trim()) {
        throw new WorkflowRunError(t("workflow.errors.emptyPath"), step.id, stepLabel(step));
      }
      const project = workflow.projectId ? getProject(workflow.projectId) : undefined;
      await openProject(path, project?.name);
      return;
    }
    case "launch_app": {
      const target = interpolate(String(cfg.target ?? ""), workflow, variables);
      if (!target.trim()) {
        throw new WorkflowRunError(t("workflow.errors.emptyApp"), step.id, stepLabel(step));
      }
      const title = String(cfg.title ?? target);
      await launchApp(target, title);
      return;
    }
    case "run_shell": {
      return runShellStep(workflow, step, cfg, variables);
    }
    case "run_workflow": {
      const wfId = String(cfg.workflowId ?? "").trim();
      if (!wfId) {
        throw new WorkflowRunError(t("workflow.errors.nestedMissing"), step.id, stepLabel(step));
      }
      if (wfId === workflow.id) {
        throw new WorkflowRunError(t("workflow.errors.nestedSelf"), step.id, stepLabel(step));
      }
      const nested = getWorkflow(wfId);
      if (!nested) {
        throw new WorkflowRunError(t("workflow.errors.nestedMissing"), step.id, stepLabel(step));
      }
      const visited = options.visited ?? new Set<string>();
      if (visited.has(nested.id)) {
        throw new WorkflowRunError(t("workflow.errors.nestedCycle"), step.id, stepLabel(step));
      }
      if (visited.size >= 8) {
        throw new WorkflowRunError(t("workflow.errors.nestedDepth"), step.id, stepLabel(step));
      }
      await runWorkflow(withInheritedProject(nested, workflow), {
        ...options,
        nested: true,
        recent: undefined,
        visited: new Set([...visited, workflow.id]),
      });
      return nested.title;
    }
    case "delay": {
      const ms = Math.max(0, Number(cfg.ms ?? 0));
      await new Promise((r) => setTimeout(r, ms));
      return;
    }
    case "notify": {
      const messageKey = cfg.messageKey ? String(cfg.messageKey) : "";
      const message = messageKey
        ? t(messageKey)
        : interpolate(String(cfg.message ?? ""), workflow, variables);
      if (message.trim()) toast.success(message);
      return;
    }
    default:
      throw new WorkflowRunError(t("workflow.errors.unknownStep"), step.id, stepLabel(step));
  }
}

/** 按 parallelGroup 分批：同组并行，组间顺序 */
function batchSteps(steps: WorkflowStep[]): WorkflowStep[][] {
  const batches: WorkflowStep[][] = [];
  let current: WorkflowStep[] = [];
  let currentGroup: number | undefined;

  for (const step of steps) {
    const g = step.parallelGroup;
    if (current.length === 0) {
      current = [step];
      currentGroup = g;
      continue;
    }
    if (g !== undefined && g === currentGroup) {
      current.push(step);
    } else {
      batches.push(current);
      current = [step];
      currentGroup = g;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

export interface RunWorkflowOptions {
  dryRun?: boolean;
  recent?: RecentMeta;
  variables?: Record<string, string>;
  /** 作为 run_workflow 子调用：不抢锁、不 Toast、不写独立执行记录 */
  nested?: boolean;
  visited?: Set<string>;
}

/** 顺序/并行执行 Workflow */
export async function runWorkflow(
  workflow: Workflow,
  options: RunWorkflowOptions = {},
): Promise<void> {
  if (workflow.steps.length === 0) {
    toast.error(t("workflow.errors.noSteps"));
    return;
  }
  if (!options.nested) {
    if (runningWorkflowId) {
      toast.error(t("workflow.errors.alreadyRunning"));
      return;
    }
    runningWorkflowId = workflow.id;
  }

  const visited = options.visited ?? new Set<string>();
  if (visited.has(workflow.id)) {
    if (!options.nested) runningWorkflowId = null;
    throw new WorkflowRunError(t("workflow.errors.nestedCycle"), "", workflow.title);
  }
  visited.add(workflow.id);

  const finishRun = () => {
    if (!options.nested) runningWorkflowId = null;
  };

  const variables = options.variables ?? {};
  const recentMeta: RecentMeta = options.recent ?? {
    kind: "workflow",
    refId: workflow.id,
    title: workflow.title,
    subtitle: workflow.description,
  };

  const runCtx = options.nested
    ? null
    : createWorkflowRunContext(
        workflow.id,
        workflow.title,
        !!options.dryRun,
        variables,
      );

  async function executeStep(step: WorkflowStep): Promise<void> {
    const started = Date.now();
    const logStep = (status: WorkflowStepLog["status"], message?: string) => {
      if (!runCtx) return;
      appendWorkflowStepLog(runCtx, {
        stepId: step.id,
        title: stepLabel(step),
        type: step.type,
        status,
        message,
        durationMs: Math.max(0, Date.now() - started),
      });
    };

    try {
      if (options.dryRun) {
        toast.success(t("workflow.dryRunStep", { step: stepLabel(step) }));
        await new Promise((r) => setTimeout(r, 120));
        logStep("success", t("workflow.runs.dryRunStep"));
        return;
      }
      const detail = await runStep(workflow, step, variables, {
        ...options,
        visited,
      });
      logStep("success", detail);
    } catch (e) {
      const msg =
        e instanceof WorkflowRunError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("workflow.errors.stepFailed");
      logStep("failed", msg);
      throw e;
    }
  }

  if (options.dryRun) {
    if (!options.nested) toast.success(t("workflow.dryRunStart", { title: workflow.title }));
    try {
      for (const step of workflow.steps) {
        await executeStep(step);
      }
      if (!options.nested) toast.success(t("workflow.dryRunDone"));
      if (runCtx) persistWorkflowRun(runCtx, "success");
    } catch (e) {
      const msg =
        e instanceof WorkflowRunError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("workflow.errors.runFailed");
      if (runCtx) persistWorkflowRun(runCtx, "failed", msg);
      if (options.nested) throw e;
    } finally {
      finishRun();
    }
    return;
  }

  try {
    for (const batch of batchSteps(workflow.steps)) {
      const runners = batch.map(async (step) => {
        try {
          await executeStep(step);
        } catch (e) {
          const msg =
            e instanceof WorkflowRunError
              ? e.message
              : e instanceof Error
                ? e.message
                : t("workflow.errors.stepFailed");
          const label = e instanceof WorkflowRunError ? e.stepTitle : stepLabel(step);
          if (!options.nested) {
            toast.error(label ? `${label}: ${msg}` : msg);
          }
          if (!step.continueOnError) throw e;
        }
      });
      await Promise.all(runners);
    }

    if (!options.nested) {
      toast.success(t("workflow.runDone", { title: workflow.title }));
      void recordRecent({ ...recentMeta, action: "open" });
    }
    if (runCtx) persistWorkflowRun(runCtx, "success");
  } catch (e) {
    const msg =
      e instanceof WorkflowRunError
        ? e.message
        : e instanceof Error
          ? e.message
          : t("workflow.errors.runFailed");
    if (runCtx) persistWorkflowRun(runCtx, "failed", msg);
    if (options.nested) throw e;
  } finally {
    finishRun();
  }
}
