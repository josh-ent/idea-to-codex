export const intakeErrorStatuses = {
  active_project_missing: 409,
  analysis_context_mismatch: 409,
  analysis_hash_mismatch: 409,
  analysis_project_mismatch: 409,
  analysis_prompt_version_mismatch: 409,
  analysis_request_mismatch: 409,
  analysis_schema_version_mismatch: 409,
  context_load_failure: 500,
  contract_violation: 502,
  invalid_structured_output: 502,
  llm_not_configured: 503,
  model_refusal: 422,
  provider_timeout: 504,
  provider_unavailable: 502,
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
