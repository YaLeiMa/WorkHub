import type { Workflow } from "./types";
import {
  extractSnippetVariables,
  type SnippetVariable,
} from "./snippetVariables";

const PROJECT_VARS = new Set(["project.path", "project.name", "project.gitUrl", "project.releasesUrl"]);

function workflowTextBlob(workflow: Workflow): string {
  const parts = [workflow.title, workflow.description];
  for (const step of workflow.steps) {
    if (step.title) parts.push(step.title);
    parts.push(JSON.stringify(step.config));
  }
  return parts.join("\n");
}

/** 从工作流各步骤文案中提取 {{变量}}（不含 project.* 内置变量） */
export function extractWorkflowVariables(workflow: Workflow): SnippetVariable[] {
  return extractSnippetVariables(workflowTextBlob(workflow)).filter(
    (v) => !PROJECT_VARS.has(v.name),
  );
}

export function hasWorkflowVariables(workflow: Workflow): boolean {
  return extractWorkflowVariables(workflow).length > 0;
}
