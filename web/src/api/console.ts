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

export interface IntakeQuestion {
  id: string;
  type: string;
  blocking: boolean;
  default_recommendation: string;
  consequence_of_non_decision: string;
  affected_artifacts: string[];
  status: "open";
  prompt: string;
}

export interface IntakeAnalysis {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  material_questions: IntakeQuestion[];
  draft_assumptions: string[];
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
  const payload = (await response.json()) as T | { error?: string; errors?: string[] };

  if (!response.ok) {
    throw new Error(
      readApiError(payload as { error?: string; errors?: string[] }, response.status),
    );
  }

  return payload as T;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const payload = (await response.json()) as T | { error?: string; errors?: string[] };

  if (!response.ok) {
    throw new Error(
      readApiError(payload as { error?: string; errors?: string[] }, response.status),
    );
  }

  return payload as T;
}

function readApiError(
  payload: { error?: string; errors?: string[] },
  status: number,
): string {
  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (Array.isArray(payload.errors)) {
    return payload.errors.join("\n");
  }

  return `request failed with status ${status}`;
}
