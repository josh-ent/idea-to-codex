import type {
  IntakeQuestionTag,
  IntakeSessionModelOutput,
} from "../../src/modules/intake/session-contract.js";
import type { IntakeSessionClient } from "../../src/modules/intake/session-service.js";

type BriefEntryType = Exclude<keyof IntakeSessionModelOutput, "question_directives">;

export interface IntakeSessionBriefEntryDraft {
  entry_type: BriefEntryType;
  text: string;
  provenance_type?: "operator_provided" | "repo_derived" | "research_derived" | "llm_inferred";
  label?: string;
  detail?: Record<string, unknown>;
  source_metadata?: Record<string, unknown>;
}

export interface IntakeSessionQuestionDirectiveDraft {
  action:
    | "retain_existing"
    | "supersede_existing"
    | "satisfied_no_longer_needed"
    | "create_new";
  existing_question_id?: string;
  prompt?: string;
  rationale_markdown?: string;
  importance?: "high" | "medium" | "low";
  tags?: IntakeQuestionTag[];
}

export interface IntakeSessionModelDraft {
  brief_entries: IntakeSessionBriefEntryDraft[];
  question_directives?: IntakeSessionQuestionDirectiveDraft[];
}

interface ParsedPromptInput {
  branch_name: string | null;
  configured_model: string;
  current_brief_entries_json: Array<Record<string, unknown>>;
  current_questions_json: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  operator_inputs_json: Record<string, unknown>;
  phase: "initial" | "continue" | "finalize";
  project_root: string;
  request_text: string;
  timeout_ms: number;
  worktree_id: string | null;
}

export function createStubIntakeSessionClient(
  resolver: (input: ParsedPromptInput) => IntakeSessionModelDraft = ({ request_text }) =>
    defaultSessionDraft(request_text),
): IntakeSessionClient {
  return {
    async generate(input) {
      const resolvedInput = readGenerateInput(input);
      const resolved = resolver(resolvedInput);

      return {
        output: toSessionServiceOutput(resolved),
        provider: "openai",
        request_log_event_id: 1001,
        resolvedModel: `${resolvedInput.configured_model}-stub`,
        response_log_event_id: 1002,
        usage: {
          input_tokens: 123,
          output_tokens: 45,
          total_tokens: 168,
        },
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
    return output ?? defaultSessionDraft(input.request_text);
  });
}

export function defaultSessionDraft(requestText: string): IntakeSessionModelDraft {
  const request = requestText.trim() || "Clarify the current request.";

  return {
    brief_entries: [
      {
        entry_type: "problem_statement",
        text: request,
        provenance_type: "operator_provided",
        label: "Operator request",
        detail: { request_text: request },
      },
      {
        entry_type: "elevator_pitch",
        text: `Clarify and shape: ${request}`,
        provenance_type: "llm_inferred",
        label: "Initial briefing synthesis",
        detail: { request_text: request },
      },
    ],
    question_directives: [],
  };
}

function readGenerateInput(input: {
  configuredModel: string;
  lane: string;
  metadata: Record<string, unknown>;
  prompt: string;
  projectRoot: string;
  timeoutMs: number;
}): ParsedPromptInput {
  const prompt = input.prompt;

  return {
    branch_name: readPromptField(prompt, "Branch"),
    configured_model: input.configuredModel,
    current_brief_entries_json: readJsonBlock(prompt, "Existing brief entries"),
    current_questions_json: readJsonBlock(prompt, "Existing questions"),
    metadata: input.metadata,
    operator_inputs_json: readJsonObject(prompt, "Operator answers and notes"),
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

function toSessionServiceOutput(draft: IntakeSessionModelDraft): IntakeSessionModelOutput {
  const output: IntakeSessionModelOutput = {
    problem_statement: [],
    elevator_pitch: [],
    desired_outcomes: [],
    scope_in: [],
    scope_out: [],
    constraints: [],
    stakeholders_or_actors: [],
    operating_context: [],
    assumptions: [],
    accepted_uncertainties: [],
    research_notes: [],
    likely_workstreams: [],
    risks_or_open_concerns: [],
    recommendations: [],
    question_directives: (draft.question_directives ?? []).map((directive) => ({
      action: directive.action,
      existing_question_id: directive.existing_question_id,
      prompt: directive.prompt,
      rationale_markdown: directive.rationale_markdown,
      importance: directive.importance,
      tags: directive.tags ?? [],
    })),
  };

  for (const entry of draft.brief_entries) {
    output[entry.entry_type].push({
      text: entry.text,
      provenance_type: entry.provenance_type ?? "llm_inferred",
      label: entry.label ?? "Session synthesis",
      detail: entry.detail ?? {},
      source_metadata: entry.source_metadata ?? {},
    });
  }

  return output;
}

function readJsonBlock(prompt: string, heading: string): Array<Record<string, unknown>> {
  const block = readPromptBlock(prompt, heading);

  if (!block.trim()) {
    return [];
  }

  return JSON.parse(block) as Array<Record<string, unknown>>;
}

function readJsonObject(prompt: string, heading: string): Record<string, unknown> {
  const block = readPromptBlock(prompt, heading);

  if (!block.trim()) {
    return {};
  }

  return JSON.parse(block) as Record<string, unknown>;
}

function readPromptField(prompt: string, label: string): string | null {
  const match = new RegExp(`^${escapeRegex(label)}: (.*)$`, "m").exec(prompt);
  const value = match?.[1]?.trim();
  return value && !value.startsWith("(") ? value : null;
}

function readPromptBlock(prompt: string, heading: string): string {
  const headings = [
    "Turn kind",
    "Project root",
    "Branch",
    "Worktree",
    "Scope fallback mode",
    "Raw request",
    "Existing brief entries",
    "Existing questions",
    "Operator answers and notes",
  ];
  const marker = `${heading}:\n`;
  const start = prompt.indexOf(marker);

  if (start === -1) {
    return "";
  }

  const contentStart = start + marker.length;
  const nextMarkers = headings
    .filter((candidate) => candidate !== heading)
    .map((candidate) => prompt.indexOf(`\n${candidate}:\n`, contentStart))
    .filter((index) => index !== -1);
  const contentEnd =
    nextMarkers.length > 0 ? Math.min(...nextMarkers) : prompt.length;

  return prompt.slice(contentStart, contentEnd).trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
