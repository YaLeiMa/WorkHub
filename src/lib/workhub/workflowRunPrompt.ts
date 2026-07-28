import { reactive } from "vue";
import type { Workflow } from "./types";
import type { SnippetVariable } from "./snippetVariables";
import {
  extractWorkflowVariables,
  hasWorkflowVariables,
} from "./workflowVariables";
import { runWorkflow, type RunWorkflowOptions } from "./workflowRunner";

export const workflowRunState = reactive<{
  open: boolean;
  workflow: Workflow | null;
  variables: SnippetVariable[];
  values: Record<string, string>;
  options: RunWorkflowOptions;
}>({
  open: false,
  workflow: null,
  variables: [],
  values: {},
  options: {},
});

function closeWorkflowRunDialog() {
  workflowRunState.open = false;
  workflowRunState.workflow = null;
  workflowRunState.variables = [];
  workflowRunState.values = {};
  workflowRunState.options = {};
}

/** 运行工作流；含 {{变量}} 时先弹窗填写 */
export async function requestWorkflowRun(
  workflow: Workflow,
  options: RunWorkflowOptions = {},
): Promise<boolean> {
  if (!hasWorkflowVariables(workflow)) {
    await runWorkflow(workflow, options);
    return false;
  }
  const variables = extractWorkflowVariables(workflow);
  workflowRunState.workflow = workflow;
  workflowRunState.variables = variables;
  workflowRunState.values = Object.fromEntries(
    variables.map((v) => [v.name, v.defaultValue]),
  );
  workflowRunState.options = options;
  workflowRunState.open = true;
  return true;
}

export function cancelWorkflowRun() {
  closeWorkflowRunDialog();
}

export async function confirmWorkflowRun() {
  const { workflow, values, options } = workflowRunState;
  if (!workflow) return;
  closeWorkflowRunDialog();
  await runWorkflow(workflow, { ...options, variables: { ...values } });
}
