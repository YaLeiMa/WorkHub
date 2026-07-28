import { reactive } from "vue";
import type { WorkflowStepType } from "./types";
import { getDb } from "./db";

export type WorkflowRunStatus = "success" | "failed";
export type WorkflowStepRunStatus = "success" | "failed";

export interface WorkflowStepLog {
  stepId: string;
  title: string;
  type: WorkflowStepType;
  status: WorkflowStepRunStatus;
  message?: string;
  durationMs: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowTitle: string;
  status: WorkflowRunStatus;
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  stepsLog: WorkflowStepLog[];
  errorMessage?: string;
  variables?: Record<string, string>;
}

export interface WorkflowRunContext {
  id: string;
  workflowId: string;
  workflowTitle: string;
  dryRun: boolean;
  startedAt: number;
  stepsLog: WorkflowStepLog[];
  variables?: Record<string, string>;
}

export const workflowRunsStore = reactive<{
  byWorkflow: Record<string, WorkflowRun[]>;
}>({
  byWorkflow: {},
});

const MAX_RUNS_PER_WORKFLOW = 50;
const loadingByWorkflow = new Map<string, Promise<void>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function parseVariables(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  } catch {
    return undefined;
  }
}

function rowToRun(r: Row): WorkflowRun {
  let stepsLog: WorkflowStepLog[] = [];
  try {
    const parsed = JSON.parse(r.steps_log || "[]");
    stepsLog = Array.isArray(parsed) ? parsed : [];
  } catch {
    stepsLog = [];
  }
  return {
    id: r.id,
    workflowId: r.workflow_id,
    workflowTitle: r.workflow_title,
    status: r.status === "failed" ? "failed" : "success",
    dryRun: !!r.dry_run,
    startedAt: Number(r.started_at),
    finishedAt: Number(r.finished_at),
    durationMs: Number(r.duration_ms),
    stepsLog,
    errorMessage: r.error_message || undefined,
    variables: parseVariables(r.variables),
  };
}

function shouldPersistRun(workflowId: string) {
  return workflowId && !workflowId.startsWith("wf_preview") && workflowId !== "preview";
}

export function createWorkflowRunContext(
  workflowId: string,
  workflowTitle: string,
  dryRun: boolean,
  variables?: Record<string, string>,
): WorkflowRunContext | null {
  if (!shouldPersistRun(workflowId)) return null;
  return {
    id: `wfr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    workflowId,
    workflowTitle,
    dryRun,
    startedAt: Date.now(),
    stepsLog: [],
    variables: variables && Object.keys(variables).length ? { ...variables } : undefined,
  };
}

export function appendWorkflowStepLog(
  ctx: WorkflowRunContext,
  log: WorkflowStepLog,
) {
  ctx.stepsLog.push(log);
}

export async function finalizeWorkflowRun(
  ctx: WorkflowRunContext,
  status: WorkflowRunStatus,
  errorMessage?: string,
) {
  const finishedAt = Date.now();
  const run: WorkflowRun = {
    id: ctx.id,
    workflowId: ctx.workflowId,
    workflowTitle: ctx.workflowTitle,
    status,
    dryRun: ctx.dryRun,
    startedAt: ctx.startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - ctx.startedAt),
    stepsLog: [...ctx.stepsLog],
    errorMessage,
    variables: ctx.variables,
  };

  const list = workflowRunsStore.byWorkflow[ctx.workflowId] ?? [];
  workflowRunsStore.byWorkflow[ctx.workflowId] = [run, ...list].slice(0, MAX_RUNS_PER_WORKFLOW);

  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(
      `INSERT INTO workflow_runs
        (id, workflow_id, workflow_title, status, dry_run, started_at, finished_at, duration_ms, steps_log, error_message, variables)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        run.id,
        run.workflowId,
        run.workflowTitle,
        run.status,
        run.dryRun ? 1 : 0,
        run.startedAt,
        run.finishedAt,
        run.durationMs,
        JSON.stringify(run.stepsLog),
        run.errorMessage ?? null,
        run.variables ? JSON.stringify(run.variables) : null,
      ],
    );

    await db.execute(
      `DELETE FROM workflow_runs WHERE id IN (
         SELECT id FROM (
           SELECT id FROM workflow_runs WHERE workflow_id = $1
           ORDER BY started_at DESC LIMIT -1 OFFSET $2
         )
       )`,
      [ctx.workflowId, MAX_RUNS_PER_WORKFLOW],
    );
  } catch {
    /* 日志写入失败不影响工作流主流程 */
  }
}

/** 后台写入执行日志，不阻塞 UI */
export function persistWorkflowRun(
  ctx: WorkflowRunContext,
  status: WorkflowRunStatus,
  errorMessage?: string,
) {
  void finalizeWorkflowRun(ctx, status, errorMessage);
}

export async function loadWorkflowRuns(workflowId: string) {
  if (workflowRunsStore.byWorkflow[workflowId]) return;
  const pending = loadingByWorkflow.get(workflowId);
  if (pending) return pending;

  const promise = (async () => {
    const db = await getDb();
    if (!db) {
      workflowRunsStore.byWorkflow[workflowId] = [];
      return;
    }
    try {
      const rows = await db.select<Row[]>(
        `SELECT * FROM workflow_runs WHERE workflow_id = $1
         ORDER BY started_at DESC LIMIT $2`,
        [workflowId, MAX_RUNS_PER_WORKFLOW],
      );
      workflowRunsStore.byWorkflow[workflowId] = rows.map(rowToRun);
    } catch {
      workflowRunsStore.byWorkflow[workflowId] = [];
    }
  })();

  loadingByWorkflow.set(workflowId, promise);
  try {
    await promise;
  } finally {
    loadingByWorkflow.delete(workflowId);
  }
}

export function getWorkflowRuns(workflowId: string): WorkflowRun[] {
  return workflowRunsStore.byWorkflow[workflowId] ?? [];
}

export async function deleteWorkflowRuns(workflowId: string) {
  delete workflowRunsStore.byWorkflow[workflowId];
  const db = await getDb();
  if (db) await db.execute("DELETE FROM workflow_runs WHERE workflow_id = $1", [workflowId]);
}

export function invalidateWorkflowRunsCache(workflowId: string) {
  delete workflowRunsStore.byWorkflow[workflowId];
}
