export interface ValidatedRecord {
  path: string;
  content: string;
  errors: string[];
  frontmatter: Record<string, unknown> | null;
}

export interface TraceLink {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  reason: string;
}

export interface ProjectSummary {
  name: string;
  path: string;
  is_git_repository: boolean;
  is_active: boolean;
}

export interface ProjectWorkspacePayload {
  active_project: ProjectSummary | null;
  known_projects: ProjectSummary[];
}

import type { IntakeAnalysis, StructuredErrorPayload } from "../../../src/modules/intake/contract.js";
export type { IntakeAnalysis, StructuredErrorPayload } from "../../../src/modules/intake/contract.js";

export interface StatusPayload {
  project: ProjectWorkspacePayload;
  repository_state: {
    available: boolean;
    branch: string | null;
    head: string | null;
    dirty_paths: string[];
    is_dirty: boolean;
    is_main_branch: boolean;
  };
  validation: {
    rootFiles: Array<{ path: string; exists: boolean }>;
    directories: Array<{ path: string; exists: boolean }>;
    decisions: ValidatedRecord[];
    proposalSets: ValidatedRecord[];
    proposalDrafts: ValidatedRecord[];
    tranches: ValidatedRecord[];
    reviews: ValidatedRecord[];
    planPackages: ValidatedRecord[];
    executionPackages: ValidatedRecord[];
    assumptions: Array<{ id: string; text: string }>;
    glossaryTerms: Array<{ term: string; definition: string; notes: string }>;
    openQuestions: string[];
    traceLinks: TraceLink[];
  };
  errors: string[];
}

export interface CreateProjectPayload extends ProjectWorkspacePayload {}

export interface OpenProjectPayload extends ProjectWorkspacePayload {}

export interface DirectorySelectionPayload {
  path: string | null;
}

export interface PackagePayload {
  id: string;
  relativePath: string;
  record: {
    id: string;
    type: "plan" | "execution";
    source_tranche: string;
  };
  path: string;
  content: string;
}

export interface PackageSetPayload {
  tranche_id: string;
  packages: PackagePayload[];
}

export interface ReviewPayload {
  id: string;
  relativePath: string;
  record: {
    id: string;
    source_tranche: string;
    status: "recorded" | "attention_required";
    related_packages: string[];
    drift_signals: string[];
    missing_package_types: Array<"plan" | "execution">;
  };
  path: string;
  content: string;
}

export interface ProposalMutationPayload {
  proposal_set_id: string;
  proposal_id: string;
  status: "approved" | "rejected";
  target_artifact: string;
}

export interface ProposalDraftPayload {
  id: string;
  relativePath: string;
  record: {
    id: string;
    proposal_set_id: string;
    status: "draft" | "approved" | "rejected" | "superseded";
    source_type: "intake" | "review";
    source_ref: string;
    target_artifact: string;
    target_kind: "top_level" | "record";
    generated_on: string;
  };
  summary: string;
  sourceContext: string;
  proposedContent: string;
  content: string;
}

export interface ProposalSetSummary {
  id: string;
  relativePath: string;
  record: {
    id: string;
    status: "draft" | "partially_approved" | "approved" | "rejected" | "superseded";
    source_type: "intake" | "review";
    source_ref: string;
    generated_on: string;
  };
  draft_count: number;
}

export interface ProposalSetPayload {
  id: string;
  relativePath: string;
  record: ProposalSetSummary["record"];
  summary: string;
  sourceContext: string;
  draftsSection: string;
  drafts: ProposalDraftPayload[];
  content: string;
}

export class ApiError extends Error {
  readonly details?: Record<string, unknown>;
  readonly errorCode?: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    message: string,
    options: {
      details?: Record<string, unknown>;
      errorCode?: string;
      retryable?: boolean;
      status: number;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.details = options.details;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T | ApiErrorPayload;

  if (!response.ok) {
    throw toApiError(payload as ApiErrorPayload, response.status);
  }

  return payload as T;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const payload = (await response.json()) as T | ApiErrorPayload;

  if (!response.ok) {
    throw toApiError(payload as ApiErrorPayload, response.status);
  }

  return payload as T;
}

type ApiErrorPayload = Partial<StructuredErrorPayload>;

function toApiError(payload: ApiErrorPayload, status: number): ApiError {
  return new ApiError(readApiErrorMessage(payload, status), {
    details: payload.details,
    errorCode: typeof payload.error_code === "string" ? payload.error_code : undefined,
    retryable: payload.retryable === true,
    status,
  });
}

function readApiErrorMessage(payload: ApiErrorPayload, status: number): string {
  if (typeof payload.message === "string") {
    return payload.message;
  }

  return `request failed with status ${status}`;
}
