import type { IntakeSessionClient } from "../../src/modules/intake/session-service.js";

export interface IntakeSessionBriefEntryDraft {
  entry_type:
    | "problem_statement"
    | "elevator_pitch"
    | "desired_outcomes"
    | "scope_in"
    | "scope_out"
    | "constraints"
    | "stakeholders_or_actors"
    | "operating_context"
    | "assumptions"
    | "accepted_uncertainties"
    | "research_notes"
    | "likely_workstreams"
    | "risks_or_open_concerns"
    | "recommendations";
  rendered_markdown: string;
  value_text?: string;
  value_items?: string[];
  provenance: Array<{
    provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
    label: string;
    detail_json?: Record<string, unknown>;
    source_metadata_json?: Record<string, unknown> | null;
  }>;
}

export interface IntakeSessionQuestionDirectiveDraft {
  directive:
    | "retain_existing"
    | "supersede_existing"
    | "satisfied_no_longer_needed"
    | "create_new";
  prior_question_id?: string;
  prompt?: string;
  rationale_markdown?: string;
  importance?: "high" | "medium" | "low";
  tags?: string[];
  carry_forward_answer?: boolean;
}

export interface IntakeSessionModelDraft {
  brief_entries: IntakeSessionBriefEntryDraft[];
  question_directives?: IntakeSessionQuestionDirectiveDraft[];
}

export function createStubIntakeSessionClient(
  resolver: (input: {
    branch_name: string | null;
    configured_model: string;
    current_brief_markdown: string;
    current_questions_markdown: string;
    operator_inputs_markdown: string;
    phase: "initial" | "continue" | "finalize";
    project_root: string;
    request_text: string;
    timeout_ms: number;
    worktree_id: string | null;
  }) => IntakeSessionModelDraft = ({ request_text }) => defaultSessionDraft(request_text),
): IntakeSessionClient {
  return {
    async generate(input) {
      const resolvedInput = readGenerateInput(input);
      const resolved = resolver(resolvedInput);
      return {
        output: toSessionServiceOutput(resolved),
        resolvedModel: `${resolvedInput.configured_model}-stub`,
      };
    },
  };
}

export function createSequenceIntakeSessionClient(
  outputs: IntakeSessionModelDraft[],
): IntakeSessionClient {
  let index = 0;

  return createStubIntakeSessionClient((input) => {
    const output = outputs[index] ?? outputs[outputs.length - 1];
    index += 1;

    if (!output) {
      return defaultSessionDraft(input.request_text);
    }

    return output;
  });
}

export function defaultSessionDraft(requestText: string): IntakeSessionModelDraft {
  const request = requestText.trim() || "Clarify the current request.";

  return {
    brief_entries: [
      {
        entry_type: "problem_statement",
        rendered_markdown: request,
        value_text: request,
        provenance: [
          {
            provenance_type: "operator_provided",
            label: "Operator request",
            detail_json: { request_text: request },
          },
        ],
      },
      {
        entry_type: "elevator_pitch",
        rendered_markdown: `Clarify and shape: ${request}`,
        value_text: `Clarify and shape: ${request}`,
        provenance: [
          {
            provenance_type: "llm_inferred",
            label: "Initial briefing synthesis",
            detail_json: { request_text: request },
          },
        ],
      },
    ],
    question_directives: [],
  };
}

function readGenerateInput(input: {
  configuredModel: string;
  lane: string;
  prompt: string;
  projectRoot: string;
  timeoutMs: number;
}): {
  branch_name: string | null;
  configured_model: string;
  current_brief_markdown: string;
  current_questions_markdown: string;
  operator_inputs_markdown: string;
  phase: "initial" | "continue" | "finalize";
  project_root: string;
  request_text: string;
  timeout_ms: number;
  worktree_id: string | null;
} {
  const prompt = input.prompt;
  return {
    branch_name: readPromptField(prompt, "Branch"),
    configured_model: input.configuredModel,
    current_brief_markdown: readPromptBlock(prompt, "Existing brief entries"),
    current_questions_markdown: readPromptBlock(prompt, "Existing questions"),
    operator_inputs_markdown: readPromptBlock(prompt, "Operator answers and notes"),
    phase: (readPromptField(prompt, "Turn kind") ?? "initial") as
      | "initial"
      | "continue"
      | "finalize",
    project_root: input.projectRoot,
    request_text: readPromptBlock(prompt, "Raw request"),
    timeout_ms: input.timeoutMs,
    worktree_id: readPromptField(prompt, "Worktree"),
  };
}

function toSessionServiceOutput(draft: IntakeSessionModelDraft) {
  const output = {
    problem_statement: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    elevator_pitch: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    desired_outcomes: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    scope_in: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    scope_out: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    constraints: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    stakeholders_or_actors: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    operating_context: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    assumptions: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    accepted_uncertainties: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    research_notes: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    likely_workstreams: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    risks_or_open_concerns: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    recommendations: [] as Array<{
      text: string;
      provenance_type: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
      label: string;
      detail: Record<string, unknown>;
      source_metadata: Record<string, unknown>;
    }>,
    question_directives: (draft.question_directives ?? []).map((directive) => ({
      action: directive.directive,
      existing_question_id: directive.prior_question_id,
      prompt: directive.prompt,
      rationale_markdown: directive.rationale_markdown,
      importance: directive.importance,
      tags: directive.tags ?? [],
    })),
  };

  for (const entry of draft.brief_entries) {
    output[entry.entry_type].push({
      text: entry.value_text ?? entry.rendered_markdown,
      provenance_type: entry.provenance[0]?.provenance_type ?? "llm_inferred",
      label: entry.provenance[0]?.label ?? "Derived brief entry",
      detail: entry.provenance[0]?.detail_json ?? {},
      source_metadata: entry.provenance[0]?.source_metadata_json ?? {},
    });
  }

  return output;
}

function readPromptField(prompt: string, label: string): string | null {
  const match = new RegExp(`^${escapeRegExp(label)}: (.*)$`, "m").exec(prompt);
  const value = match?.[1]?.trim();
  return value && value !== "-" && value !== "(unavailable)" ? value : null;
}

function readPromptBlock(prompt: string, label: string): string {
  const match = new RegExp(
    `${escapeRegExp(label)}:\\n([\\s\\S]*?)(?=\\n[A-Z][^\\n]*:\\n|$)`,
  ).exec(prompt);

  return match?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
