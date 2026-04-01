import { z } from "zod";

import type { StructuredErrorPayload } from "./errors.js";

export const intakeBriefEntryTypes = [
  "problem_statement",
  "elevator_pitch",
  "desired_outcomes",
  "scope_in",
  "scope_out",
  "constraints",
  "stakeholders_or_actors",
  "operating_context",
  "assumptions",
  "accepted_uncertainties",
  "research_notes",
  "likely_workstreams",
  "risks_or_open_concerns",
  "recommendations",
] as const;

export const intakeSessionStatuses = [
  "active",
  "finalizing",
  "finalized",
  "abandoned",
  "superseded",
] as const;

export const intakeTurnKinds = ["initial", "continue", "finalize"] as const;
export const intakeTurnStatuses = ["succeeded", "failed"] as const;
export const intakeBriefVersionStatuses = ["draft", "final"] as const;
export const intakeQuestionImportanceValues = ["high", "medium", "low"] as const;
export const intakeQuestionStatuses = [
  "open",
  "answered",
  "accepted_without_answer",
  "satisfied",
  "superseded",
] as const;
export const intakeQuestionLineageRelationTypes = [
  "retained_as",
  "superseded_by",
  "satisfied_by_turn",
  "accepted_without_answer_at_finalize",
] as const;
export const intakeQuestionDirectiveActions = [
  "retain_existing",
  "supersede_existing",
  "satisfied_no_longer_needed",
  "create_new",
] as const;
export const intakeQuestionTags = [
  "scope",
  "constraints",
  "stakeholders",
  "risks",
  "assumptions",
  "outcomes",
  "operating_context",
  "uncertainties",
  "research",
  "recommendations",
] as const;
export const provenanceTypes = [
  "operator_provided",
  "repo_derived",
  "research_derived",
  "llm_inferred",
] as const;
export const intakeSessionOutputResponseFormatName = "intake_session_output";

export type IntakeBriefEntryType = (typeof intakeBriefEntryTypes)[number];
export type IntakeSessionStatus = (typeof intakeSessionStatuses)[number];
export type IntakeTurnKind = (typeof intakeTurnKinds)[number];
export type IntakeTurnStatus = (typeof intakeTurnStatuses)[number];
export type IntakeBriefVersionStatus = (typeof intakeBriefVersionStatuses)[number];
export type IntakeQuestionImportance = (typeof intakeQuestionImportanceValues)[number];
export type IntakeQuestionStatus = (typeof intakeQuestionStatuses)[number];
export type IntakeQuestionLineageRelationType =
  (typeof intakeQuestionLineageRelationTypes)[number];
export type IntakeQuestionDirectiveAction =
  (typeof intakeQuestionDirectiveActions)[number];
export type IntakeQuestionTag = (typeof intakeQuestionTags)[number];
export type ProvenanceType = (typeof provenanceTypes)[number];

const provenanceTypeSchema = z.enum(provenanceTypes);
const importanceSchema = z.enum(intakeQuestionImportanceValues);
const questionTagSchema = z.enum(intakeQuestionTags);
const directiveActionSchema = z.enum(intakeQuestionDirectiveActions);

export const intakeSessionBriefItemSchema = z
  .object({
    text: z.string().trim().min(1),
    provenance_type: provenanceTypeSchema,
    label: z.string().trim().min(1),
    detail: z.record(z.string(), z.unknown()).default({}),
    source_metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.provenance_type === "research_derived"
      && Object.keys(value.source_metadata).length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "research_derived provenance requires source_metadata.",
        path: ["source_metadata"],
      });
    }
  });

export const intakeSessionQuestionDirectiveSchema = z
  .object({
    action: directiveActionSchema,
    existing_question_id: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).optional(),
    rationale_markdown: z.string().trim().min(1).optional(),
    importance: importanceSchema.optional(),
    tags: z.array(questionTagSchema).default([]),
  })
  .strict();

export const intakeSessionOutputSchema = z
  .object({
    problem_statement: z.array(intakeSessionBriefItemSchema).default([]),
    elevator_pitch: z.array(intakeSessionBriefItemSchema).default([]),
    desired_outcomes: z.array(intakeSessionBriefItemSchema).default([]),
    scope_in: z.array(intakeSessionBriefItemSchema).default([]),
    scope_out: z.array(intakeSessionBriefItemSchema).default([]),
    constraints: z.array(intakeSessionBriefItemSchema).default([]),
    stakeholders_or_actors: z.array(intakeSessionBriefItemSchema).default([]),
    operating_context: z.array(intakeSessionBriefItemSchema).default([]),
    assumptions: z.array(intakeSessionBriefItemSchema).default([]),
    accepted_uncertainties: z.array(intakeSessionBriefItemSchema).default([]),
    research_notes: z.array(intakeSessionBriefItemSchema).default([]),
    likely_workstreams: z.array(intakeSessionBriefItemSchema).default([]),
    risks_or_open_concerns: z.array(intakeSessionBriefItemSchema).default([]),
    recommendations: z.array(intakeSessionBriefItemSchema).default([]),
    question_directives: z.array(intakeSessionQuestionDirectiveSchema).default([]),
  })
  .strict();

export type IntakeSessionModelOutput = z.infer<typeof intakeSessionOutputSchema>;
export type IntakeSessionQuestionDirective =
  IntakeSessionModelOutput["question_directives"][number];

export interface IntakeScope {
  scope_key: string;
  project_root: string;
  branch_name: string | null;
  worktree_id: string | null;
  scope_fallback_mode: "project_branch_worktree" | "project_branch" | "project_only";
}

export interface IntakeSession {
  id: string;
  scope_key: string;
  project_root: string;
  branch_name: string | null;
  worktree_id: string | null;
  scope_fallback_mode: IntakeScope["scope_fallback_mode"];
  status: IntakeSessionStatus;
  current_brief_version_id: string | null;
  session_revision: number;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  abandoned_at: string | null;
}

export interface IntakeBriefVersion {
  id: string;
  session_id: string;
  brief_version_number: number;
  created_from_turn_id: string;
  status: IntakeBriefVersionStatus;
  rendered_markdown: string;
  created_at: string;
}

export interface AuthoritativeProvenanceEntry {
  provenance_type: ProvenanceType;
  label: string;
  detail: Record<string, unknown>;
  source_metadata: Record<string, unknown>;
}

export interface IntakeBriefEntryRecord {
  id: string;
  brief_version_id: string;
  entry_type: IntakeBriefEntryType;
  position: number;
  value_json: string;
  rendered_markdown: string;
  provenance_summary: string | null;
}

export interface IntakeBriefEntry extends IntakeBriefEntryRecord {
  provenance_entries: AuthoritativeProvenanceEntry[];
}

export interface IntakeTurn {
  id: string;
  session_id: string;
  turn_number: number;
  turn_kind: IntakeTurnKind;
  base_brief_version_id: string | null;
  result_brief_version_id: string | null;
  request_payload_json: string;
  llm_response_json: string | null;
  created_at: string;
  completed_at: string | null;
  status: IntakeTurnStatus;
  provider: string | null;
  lane: string | null;
  configured_model: string | null;
  resolved_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  request_log_event_id: number | null;
  response_log_event_id: number | null;
  session_revision_before: number | null;
  session_revision_after: number | null;
  question_reconciliation_summary_json: string | null;
}

export interface IntakeQuestionRecord {
  id: string;
  display_id: string;
  session_id: string;
  origin_turn_id: string;
  current_prompt: string;
  current_rationale_markdown: string;
  importance: IntakeQuestionImportance;
  tags: IntakeQuestionTag[];
  status: IntakeQuestionStatus;
  current_display_order: number;
  answer_text: string | null;
  answer_updated_at: string | null;
  superseded_by_question_id: string | null;
  session_revision_seen: number;
  updated_at: string;
}

export interface IntakeQuestion extends IntakeQuestionRecord {
  provenance_entries: AuthoritativeProvenanceEntry[];
}

export interface IntakeQuestionVersionRecord {
  id: string;
  question_id: string;
  display_id: string;
  session_id: string;
  turn_id: string;
  version_number: number;
  prompt: string;
  rationale_markdown: string;
  importance: IntakeQuestionImportance;
  tags: IntakeQuestionTag[];
  status: IntakeQuestionStatus;
  display_order: number;
  answer_text: string | null;
  created_at: string;
}

export interface IntakeQuestionLineage {
  id: string;
  session_id: string;
  turn_id: string;
  from_question_id: string;
  to_question_id: string | null;
  relation_type: IntakeQuestionLineageRelationType;
}

export interface ProvenanceEntryRecord {
  id: string;
  owner_kind: "brief_entry" | "question_version";
  owner_id: string;
  provenance_type: ProvenanceType;
  label: string;
  detail_json: string;
  source_metadata_json: string;
  created_at: string;
}

export interface IntakeSessionDetail {
  session: IntakeSession;
  request_text: string;
  current_brief: IntakeBriefVersion | null;
  current_brief_entries: IntakeBriefEntry[];
  questions: IntakeQuestion[];
  question_lineage_summary: IntakeQuestionLineage[];
}

export interface IntakeSessionPayload extends IntakeSessionDetail {
  session_revision: number;
}

export interface StructuredSessionTurnUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export type SessionStructuredErrorPayload = StructuredErrorPayload;
