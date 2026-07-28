import { reactive } from "vue";
import type { Workflow, WorkflowStep } from "./types";
import { getDb } from "./db";

const SEED_KEY = "seed_workflows_v1";
const SEED_V2_KEY = "seed_workflows_v2_dev_start";
const SEED_V3_KEY = "seed_workflows_v3_git_templates";
let loading: Promise<void> | null = null;

export const workflowsStore = reactive<{ list: Workflow[]; loaded: boolean }>({
  list: [],
  loaded: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToWorkflow(r: Row): Workflow {
  let steps: WorkflowStep[] = [];
  try {
    const parsed = JSON.parse(r.steps || "[]");
    steps = Array.isArray(parsed) ? parsed : [];
  } catch {
    steps = [];
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    projectId: (r.project_id ?? r.projectId) || undefined,
    tags: parseJsonStringArray(r.tags),
    favorite: !!r.is_favorite,
    steps,
    hotkey: r.hotkey || undefined,
    updatedAt: Number(r.updated_at),
  };
}

async function insertRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  w: Workflow,
) {
  await db.execute(
    `INSERT INTO workflows
      (id,title,description,project_id,tags,is_favorite,steps,hotkey,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      w.id,
      w.title,
      w.description,
      w.projectId ?? null,
      JSON.stringify(w.tags),
      w.favorite ? 1 : 0,
      JSON.stringify(w.steps),
      w.hotkey ?? null,
      w.updatedAt,
      w.updatedAt,
    ],
  );
}

function seedWorkflows(): Workflow[] {
  const now = Date.now();
  return [
    {
      id: `wf_seed_${now}_dev`,
      title: "开发开工",
      description: "打开 VSCode → 复制 npm run dev → 提示（请先绑定项目）",
      tags: ["开工", "项目"],
      favorite: true,
      steps: [
        {
          id: `step_${now}_1`,
          type: "open_vscode",
          title: "打开 VSCode",
          config: { useProjectPath: true },
        },
        {
          id: `step_${now}_2`,
          type: "copy_text",
          title: "复制启动命令",
          config: { text: "npm run dev" },
        },
        {
          id: `step_${now}_3`,
          type: "notify",
          config: { message: "开发环境已就绪，请粘贴并运行启动命令" },
        },
      ],
      updatedAt: now,
    },
    {
      id: `wf_seed_${now}_2`,
      title: "复制 Git 常用命令",
      description: "复制 git status 到剪贴板（需自行粘贴执行）",
      tags: ["git"],
      favorite: false,
      steps: [
        {
          id: `step_${now}_3`,
          type: "copy_text",
          title: "git status",
          config: { text: "git status" },
        },
        {
          id: `step_${now}_4`,
          type: "delay",
          config: { ms: 300 },
        },
        {
          id: `step_${now}_5`,
          type: "notify",
          config: { messageKey: "workflow.templates.gitCopied" },
        },
      ],
      updatedAt: now,
    },
    {
      id: `wf_seed_${now}_3`,
      title: "打开项目文档目录",
      description: "在资源管理器中打开项目根目录",
      tags: ["项目", "文档"],
      favorite: false,
      steps: [
        {
          id: `step_${now}_6`,
          type: "open_path",
          title: "打开目录",
          config: { useProjectPath: true },
        },
      ],
      updatedAt: now,
    },
  ];
}

function seedGitWorkflowTemplates(now: number): Workflow[] {
  return [
    {
      id: `wf_seed_${now}_git_commit`,
      title: "Git 提交",
      description: "复制 git status → 填写注释 → 复制 add + commit（需绑定项目）",
      tags: ["git", "提交"],
      favorite: false,
      steps: [
        {
          id: `step_${now}_gc1`,
          type: "copy_text",
          title: "git status",
          config: { text: "git status" },
        },
        {
          id: `step_${now}_gc2`,
          type: "copy_text",
          title: "暂存并提交",
          config: { text: 'git add -A && git commit -m "{{msg:fix: update}}"' },
        },
        {
          id: `step_${now}_gc3`,
          type: "notify",
          config: { message: "提交命令已复制，请在项目目录终端执行" },
        },
      ],
      updatedAt: now,
    },
    {
      id: `wf_seed_${now}_release`,
      title: "发版打 Tag",
      description: "填写版本号 → 复制 tag 命令 → 打开 Releases 页（需绑定项目与 Git 地址）",
      tags: ["git", "发版"],
      favorite: false,
      steps: [
        {
          id: `step_${now}_rl1`,
          type: "copy_text",
          title: "打 tag 并推送",
          config: {
            text: "git tag v{{version:1.0.0}} && git push origin v{{version:1.0.0}}",
          },
        },
        {
          id: `step_${now}_rl2`,
          type: "open_link",
          title: "打开 Releases",
          config: { url: "{{project.releasesUrl}}" },
        },
        {
          id: `step_${now}_rl3`,
          type: "notify",
          config: { message: "Tag 命令已复制，请在终端执行后于 Releases 页发布" },
        },
      ],
      updatedAt: now,
    },
  ];
}

async function seedWorkflowByTitle(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  workflow: Workflow,
) {
  const existing = await db.select<{ id: string }[]>(
    "SELECT id FROM workflows WHERE title = $1 LIMIT 1",
    [workflow.title],
  );
  if (existing.length === 0) await insertRow(db, workflow);
}

async function seedIfNeeded(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const { hasMeta, setMeta } = await import("./meta");
  if (!(await hasMeta(db, SEED_KEY))) {
    const existing = await db.select<{ id: string }[]>(
      "SELECT id FROM workflows LIMIT 1",
    );
    if (existing.length === 0) {
      for (const w of seedWorkflows()) {
        await insertRow(db, w);
      }
    }
    await setMeta(db, SEED_KEY, "1");
  }
  if (!(await hasMeta(db, SEED_V2_KEY))) {
    const existing = await db.select<{ id: string }[]>(
      "SELECT id FROM workflows WHERE title = $1 LIMIT 1",
      ["开发开工"],
    );
    if (existing.length === 0) {
      const now = Date.now();
      const w: Workflow = {
        id: `wf_seed_${now}_dev`,
        title: "开发开工",
        description: "打开 VSCode → 复制 npm run dev → 提示（请先绑定项目）",
        tags: ["开工", "项目"],
        favorite: true,
        steps: [
          {
            id: `step_${now}_1`,
            type: "open_vscode",
            title: "打开 VSCode",
            config: { useProjectPath: true },
          },
          {
            id: `step_${now}_2`,
            type: "copy_text",
            title: "复制启动命令",
            config: { text: "npm run dev" },
          },
          {
            id: `step_${now}_3`,
            type: "notify",
            config: { message: "开发环境已就绪，请粘贴并运行启动命令" },
          },
        ],
        updatedAt: now,
      };
      await insertRow(db, w);
    }
    await setMeta(db, SEED_V2_KEY, "1");
  }
  if (!(await hasMeta(db, SEED_V3_KEY))) {
    const now = Date.now();
    for (const w of seedGitWorkflowTemplates(now)) {
      await seedWorkflowByTitle(db, w);
    }
    await setMeta(db, SEED_V3_KEY, "1");
  }
}

export async function loadWorkflows() {
  if (workflowsStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const db = await getDb();
    if (!db) {
      workflowsStore.list = [];
      workflowsStore.loaded = true;
      return;
    }

    await seedIfNeeded(db);
    const rows = await db.select<Row[]>(
      "SELECT * FROM workflows ORDER BY updated_at DESC",
    );
    workflowsStore.list = rows.map(rowToWorkflow);
    workflowsStore.loaded = true;
    const { syncWorkflowHotkeys } = await import("./workflowHotkeys");
    await syncWorkflowHotkeys();
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export function getWorkflow(id: string): Workflow | undefined {
  return workflowsStore.list.find((w) => w.id === id);
}

export type WorkflowFormData = Omit<Workflow, "id" | "updatedAt">;

export async function createWorkflow(data: WorkflowFormData) {
  const w: Workflow = {
    id: `wf_${Date.now()}`,
    title: data.title,
    description: data.description,
    projectId: data.projectId,
    tags: [...data.tags],
    favorite: data.favorite,
    hotkey: data.hotkey,
    steps: data.steps.map((s) => ({ ...s, config: { ...s.config } })),
    updatedAt: Date.now(),
  };
  workflowsStore.list.unshift(w);
  const db = await getDb();
  if (db) await insertRow(db, w);
  else throw new Error("database unavailable");
  const { syncWorkflowHotkeys } = await import("./workflowHotkeys");
  await syncWorkflowHotkeys();
  return w;
}

export async function updateWorkflow(id: string, data: WorkflowFormData) {
  const w = workflowsStore.list.find((x) => x.id === id);
  if (!w) return;
  w.title = data.title;
  w.description = data.description;
  w.projectId = data.projectId;
  w.tags = [...data.tags];
  w.favorite = data.favorite;
  w.hotkey = data.hotkey;
  w.steps = data.steps.map((s) => ({ ...s, config: { ...s.config } }));
  w.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      `UPDATE workflows SET title=$1,description=$2,project_id=$3,tags=$4,is_favorite=$5,steps=$6,hotkey=$7,updated_at=$8 WHERE id=$9`,
      [
        w.title,
        w.description,
        w.projectId ?? null,
        JSON.stringify(w.tags),
        w.favorite ? 1 : 0,
        JSON.stringify(w.steps),
        w.hotkey ?? null,
        w.updatedAt,
        id,
      ],
    );
  else throw new Error("database unavailable");
  const { syncWorkflowHotkeys } = await import("./workflowHotkeys");
  await syncWorkflowHotkeys();
}

export async function deleteWorkflow(id: string) {
  const idx = workflowsStore.list.findIndex((w) => w.id === id);
  if (idx >= 0) workflowsStore.list.splice(idx, 1);
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM workflows WHERE id=$1", [id]);
    const { deleteWorkflowRuns } = await import("./workflowRunsStore");
    await deleteWorkflowRuns(id);
  } else throw new Error("database unavailable");
  const { syncWorkflowHotkeys } = await import("./workflowHotkeys");
  await syncWorkflowHotkeys();
}

export async function toggleWorkflowFavorite(id: string) {
  const w = workflowsStore.list.find((x) => x.id === id);
  if (!w) return;
  w.favorite = !w.favorite;
  w.updatedAt = Date.now();
  const db = await getDb();
  if (db)
    await db.execute(
      "UPDATE workflows SET is_favorite=$1, updated_at=$2 WHERE id=$3",
      [w.favorite ? 1 : 0, w.updatedAt, id],
    );
}

export function newWorkflowStep(type: WorkflowStep["type"]): WorkflowStep {
  const id = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const defaults: Record<WorkflowStep["type"], Record<string, unknown>> = {
    copy_snippet: { snippetId: "" },
    copy_text: { text: "" },
    copy_project_command: { commandId: "" },
    open_link: { url: "" },
    open_project_link: { linkId: "" },
    open_path: { path: "", useProjectPath: false },
    open_vscode: { useProjectPath: true, path: "" },
    launch_app: { target: "", title: "" },
    run_shell: {
      command: "",
      useProjectPath: true,
      cwd: "",
      timeoutMs: 30_000,
      showOutput: true,
      copyOutput: true,
    },
    run_workflow: { workflowId: "" },
    delay: { ms: 500 },
    notify: { message: "" },
  };
  return { id, type, config: { ...defaults[type] } };
}
