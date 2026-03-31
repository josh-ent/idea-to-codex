import { workflowQuestionTypes } from "../governance/workflow.js";

export const intakeSchemaVersion = 2;
export const intakePromptVersion = "2026-03-31.1";

export const intakeQuestionTypes = [
  ...workflowQuestionTypes,
  "terminology_integrity",
  "data_definition_integrity",
  "architecture_direction",
  "governance_posture",
  "handoff_quality",
  "bounded_change",
] as const;

export type IntakeQuestionType = (typeof intakeQuestionTypes)[number];

export interface IntakeQuestion {
  id: IntakeQuestionType;
  display_id: string;
  type: IntakeQuestionType;
  blocking: boolean;
  default_recommendation: string;
  consequence_of_non_decision: string;
  affected_artifacts: string[];
  status: "open";
  prompt: string;
}

export interface IntakeContextSourceUsed {
  path: string;
  content_hash: string;
  truncated: boolean;
}

export interface IntakeContextSourceIssue {
  path: string;
  reason: string;
}

export interface IntakeAnalysisMetadata {
  provider: string;
  lane: string;
  configured_model: string;
  resolved_model: string | null;
  schema_version: number;
  prompt_version: string;
  canonical_project_root: string;
  request_hash: string;
  context_hash: string;
  analysis_hash: string;
  duration_ms: number;
  context_sources_used: IntakeContextSourceUsed[];
  context_sources_missing: IntakeContextSourceIssue[];
  context_sources_invalid: IntakeContextSourceIssue[];
  context_truncated: boolean;
}

export interface IntakeAnalysis {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  material_questions: IntakeQuestion[];
  draft_assumptions: string[];
  analysis_metadata: IntakeAnalysisMetadata;
}

export interface IntakeModelOutput {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  question_types: IntakeQuestionType[];
  draft_assumptions: string[];
}

export interface StructuredErrorPayload {
  message: string;
  error_code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
