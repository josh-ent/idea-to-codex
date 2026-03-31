import type { StructuredErrorPayload } from "./contract.js";

export const intakeFeatureFlag = "intake_sessions_v1";

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
export const provenanceTypes = [
  "operator_provided",
  "repo_derived",
  "research_derived",
  "llm_inferred",
] as const;

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
export type ProvenanceType = (typeof provenanceTypes)[number];

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

export interface IntakeBriefEntry {
  id: string;
  brief_version_id: string;
  entry_type: IntakeBriefEntryType;
  position: number;
  value_json: string;
  rendered_markdown: string;
  provenance_summary: string | null;
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
}

export interface IntakeQuestion {
  id: string;
  session_id: string;
  origin_turn_id: string;
  current_prompt: string;
  current_rationale_markdown: string;
  importance: IntakeQuestionImportance;
  tags: string[];
  status: IntakeQuestionStatus;
  current_display_order: number;
  answer_text: string | null;
  answer_updated_at: string | null;
  superseded_by_question_id: string | null;
  session_revision_seen: number;
  updated_at: string;
}

export interface IntakeQuestionVersion {
  id: string;
  question_id: string;
  session_id: string;
  turn_id: string;
  version_number: number;
  prompt: string;
  rationale_markdown: string;
  importance: IntakeQuestionImportance;
  tags: string[];
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

export interface ProvenanceEntry {
  id: string;
  owner_kind: "brief_entry" | "question_version";
  owner_id: string;
  provenance_type: ProvenanceType;
  label: string;
  detail_json: string;
  source_metadata_json: string;
  created_at: string;
}

export interface StructuredBriefEntryInput {
  entry_type: IntakeBriefEntryType;
  rendered_markdown: string;
  value: string;
  provenance: {
    provenance_type: ProvenanceType;
    label: string;
    detail: Record<string, unknown>;
    source_metadata: Record<string, unknown>;
  };
}

export interface StructuredQuestionDirectiveInput {
  action: IntakeQuestionDirectiveAction;
  existing_question_id?: string;
  prompt?: string;
  rationale_markdown?: string;
  importance?: IntakeQuestionImportance;
  tags?: string[];
}

export interface StructuredResearchNoteInput {
  text: string;
  provenance_type: ProvenanceType;
  label: string;
  source_metadata: Record<string, unknown>;
}

export interface IntakeSessionOutput {
  brief_entries: StructuredBriefEntryInput[];
  question_directives: StructuredQuestionDirectiveInput[];
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

export interface StudioStatusFeatureFlags {
  intake_sessions_v1: boolean;
  proposal_llm_v1: boolean;
}

export type SessionStructuredErrorPayload = StructuredErrorPayload;
