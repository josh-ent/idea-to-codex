export interface WorkflowContext {
  actor?: string;
  use_case?: string;
  actor_goal?: string;
  use_case_constraints?: string[];
}

export const workflowQuestionTypes = [
  "workflow_actor",
  "workflow_use_case",
  "workflow_goal",
  "workflow_constraints",
] as const;

const genericPlaceholders = new Set([
  "user",
  "actor",
  "role",
  "workflow",
  "use case",
  "flow",
  "tbd",
  "unknown",
  "todo",
  "n/a",
]);

const goalPlaceholders = new Set([
  ...genericPlaceholders,
  "improve workflow",
  "make it better",
]);

export function hasWorkflowContext(context: WorkflowContext): boolean {
  return Boolean(
    context.actor?.trim() ||
      context.use_case?.trim() ||
      context.actor_goal?.trim() ||
      context.use_case_constraints?.some((value) => value.trim()),
  );
}

export function missingWorkflowFields(context: WorkflowContext): string[] {
  if (!hasWorkflowContext(context)) {
    return [];
  }

  const missing: string[] = [];

  if (!context.actor?.trim()) {
    missing.push("actor");
  }

  if (!context.use_case?.trim()) {
    missing.push("use_case");
  }

  if (!context.actor_goal?.trim()) {
    missing.push("actor_goal");
  }

  if (!(context.use_case_constraints?.some((value) => value.trim()) ?? false)) {
    missing.push("use_case_constraints");
  }

  return missing;
}

export function hasNonPlaceholderWorkflowConstraint(values: string[]): boolean {
  return values.some((value) => !isWorkflowPlaceholder(value, "constraint"));
}

export function findWorkflowPlaceholderFields(context: WorkflowContext): string[] {
  const placeholders: string[] = [];

  if (context.actor?.trim() && isWorkflowPlaceholder(context.actor, "actor")) {
    placeholders.push("actor");
  }

  if (context.use_case?.trim() && isWorkflowPlaceholder(context.use_case, "use_case")) {
    placeholders.push("use_case");
  }

  if (context.actor_goal?.trim() && isWorkflowPlaceholder(context.actor_goal, "actor_goal")) {
    placeholders.push("actor_goal");
  }

  if (
    context.use_case_constraints?.some(
      (value) => value.trim() && isWorkflowPlaceholder(value, "constraint"),
    )
  ) {
    placeholders.push("use_case_constraints");
  }

  return placeholders;
}

export function normalizeWorkflowConstraints(value: string): string[] {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

export function workflowContextLines(context: WorkflowContext): string[] {
  if (!hasWorkflowContext(context) || missingWorkflowFields(context).length > 0) {
    return ["- No Actor-scoped workflow context is defined for this tranche."];
  }

  return [
    `- Actor: ${context.actor!.trim()}`,
    `- Use Case: ${context.use_case!.trim()}`,
    `- Goal: ${context.actor_goal!.trim()}`,
    ...context.use_case_constraints!.map((constraint) => `- Constraint: ${constraint.trim()}`),
  ];
}

export function isWorkflowQuestionType(value: string): value is (typeof workflowQuestionTypes)[number] {
  return workflowQuestionTypes.some((type) => type === value);
}

function isWorkflowPlaceholder(
  value: string,
  kind: "actor" | "use_case" | "actor_goal" | "constraint",
): boolean {
  const normalized = normalizeWorkflowValue(value);

  if (!normalized) {
    return false;
  }

  const placeholders = kind === "actor_goal" ? goalPlaceholders : genericPlaceholders;
  return placeholders.has(normalized);
}

function normalizeWorkflowValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
