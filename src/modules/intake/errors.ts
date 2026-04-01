export interface StructuredErrorPayload {
  message: string;
  error_code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export const intakeErrorStatuses = {
  active_project_missing: 409,
  active_intake_session_exists: 409,
  analysis_context_mismatch: 409,
  analysis_hash_mismatch: 409,
  analysis_project_mismatch: 409,
  analysis_prompt_version_mismatch: 409,
  analysis_request_mismatch: 409,
  analysis_schema_version_mismatch: 409,
  blocking_questions_unanswered: 409,
  context_load_failure: 500,
  contract_violation: 502,
  intake_question_mapping_invalid: 409,
  intake_session_conflict: 409,
  intake_session_not_active: 409,
  intake_session_not_found: 404,
  intake_session_revision_conflict: 409,
  invalid_structured_output: 502,
  llm_not_configured: 503,
  model_refusal: 422,
  proposal_intake_sessions_unavailable: 409,
  proposal_session_not_found: 404,
  proposal_session_not_active: 409,
  proposal_session_revision_conflict: 409,
  provider_timeout: 504,
  provider_unavailable: 502,
  unknown_answer_ids: 409,
} as const;

export type IntakeErrorCode = keyof typeof intakeErrorStatuses;

const retryableCodes = new Set<IntakeErrorCode>([
  "provider_timeout",
  "provider_unavailable",
  "model_refusal",
  "invalid_structured_output",
  "contract_violation",
]);

export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: IntakeErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "IntakeError";
    this.code = code;
    this.status = intakeErrorStatuses[code];
    this.retryable = options.retryable ?? retryableCodes.has(code);
    this.details = options.details;
  }
}

export function isIntakeError(error: unknown): error is IntakeError {
  return error instanceof IntakeError;
}

export function toStructuredErrorPayload(error: IntakeError): StructuredErrorPayload {
  return {
    message: error.message,
    error_code: error.code,
    retryable: error.retryable,
    details: error.details,
  };
}
