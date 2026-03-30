import fs from "node:fs/promises";
import path from "node:path";

import { getRepositoryState } from "../artifacts/git.js";
import { formatInlineList } from "../artifacts/markdown.js";
import {
  collectValidationErrors,
  loadTranche,
  type RepositoryValidation,
  validateRepository,
} from "../artifacts/repository.js";
import type { TrancheFrontmatter } from "../artifacts/schemas.js";
import {
  buildFindings,
  buildRecommendedActions,
  deriveMissingPackageTypes,
  detectDriftSignals,
  formatRepositoryState,
} from "./review-analysis.js";
import {
  findPackageAlignmentDrift,
  findPackagesMissingWorkflowContext,
} from "./review-package-drift.js";
import {
  findWorkflowPlaceholderFields,
  hasWorkflowContext,
  missingWorkflowFields as findMissingWorkflowFields,
} from "./workflow.js";

export interface GeneratedReview {
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

export async function generateReview(
  rootDir: string,
  trancheId: string,
  persist = true,
): Promise<GeneratedReview> {
  const validation = await validateRepository(rootDir);
  const trancheRecord = await loadTranche(rootDir, trancheId);
  const tranche = trancheRecord.frontmatter!;
  const repositoryState = await getRepositoryState(rootDir);
  const packageAlignmentDrift = await findPackageAlignmentDrift(
    rootDir,
    tranche.id,
    validation,
  );
  const review = buildReviewRecord(
    validation,
    tranche,
    repositoryState,
    packageAlignmentDrift,
  );

  if (persist) {
    const absolutePath = path.join(rootDir, review.relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, review.content, "utf8");
  }

  return review;
}

function buildReviewRecord(
  validation: RepositoryValidation,
  tranche: TrancheFrontmatter,
  repositoryState: Awaited<ReturnType<typeof getRepositoryState>>,
  packageAlignmentDrift: string[],
): GeneratedReview {
  const relatedDecisions = validation.decisions
    .filter((record) => record.frontmatter && record.errors.length === 0)
    .map((record) => record.frontmatter!)
    .filter(
      (decision) =>
        tranche.related_decisions.includes(decision.id) ||
        decision.related_tranches.includes(tranche.id),
    );
  const planPackageRecords = validation.planPackages.filter(
    (record) =>
      record.frontmatter?.source_tranche === tranche.id,
  );
  const executionPackageRecords = validation.executionPackages.filter(
    (record) =>
      record.frontmatter?.source_tranche === tranche.id,
  );
  const planPackages = planPackageRecords.filter((record) => record.errors.length === 0);
  const executionPackages = executionPackageRecords.filter((record) => record.errors.length === 0);
  const glossaryTerms = new Set(validation.glossaryTerms.map((term) => term.term));
  const missingTerms = tranche.related_terms.filter((term) => !glossaryTerms.has(term));
  const validationErrors = collectValidationErrors(validation);
  const workflowContext = {
    actor: tranche.actor,
    use_case: tranche.use_case,
    actor_goal: tranche.actor_goal,
    use_case_constraints: tranche.use_case_constraints,
  };
  const workflowScoped = hasWorkflowContext(workflowContext);
  const missingWorkflowFields = findMissingWorkflowFields(workflowContext);
  const workflowPlaceholderFields = findWorkflowPlaceholderFields(workflowContext);
  const packagesMissingWorkflowContext = workflowScoped
    ? findPackagesMissingWorkflowContext(
        [...planPackageRecords, ...executionPackageRecords],
        workflowContext,
      )
    : [];
  const detectedSignals = detectDriftSignals({
    tranche,
    planPackageCount: planPackages.length,
    executionPackageCount: executionPackages.length,
    missingTerms,
    relatedDecisionCount: relatedDecisions.length,
    missingWorkflowFields,
    packagesMissingWorkflowContext: packagesMissingWorkflowContext.length,
    workflowPlaceholderFields: workflowPlaceholderFields.length,
    packageAlignmentDrift: packageAlignmentDrift.length,
    hasExecutionConductDrift: repositoryState.available && repositoryState.is_dirty,
  });
  const findings = buildFindings({
    validationErrors,
    planPackages: planPackageRecords,
    executionPackages: executionPackageRecords,
    missingTerms,
    architectureDecisionMissing:
      tranche.affected_artifacts.includes("ARCHITECTURE.md") && relatedDecisions.length === 0,
    missingWorkflowFields,
    packagesMissingWorkflowContext,
    workflowPlaceholderFields,
    packageAlignmentDrift,
    repositoryState,
  });
  const recommendedActions = buildRecommendedActions({
    tranche,
    detectedSignals,
    missingTerms,
    validationErrors,
    planPackages,
    executionPackages,
    missingWorkflowFields,
    packagesMissingWorkflowContext,
    workflowPlaceholderFields,
    packageAlignmentDrift,
    repositoryState,
  });
  const status =
    validationErrors.length > 0 || detectedSignals.length > 0
      ? "attention_required"
      : "recorded";
  const id = `REVIEW-${tranche.id}`;
  const relatedPackageIds = [
    ...planPackages.map((record) => record.frontmatter!.id),
    ...executionPackages.map((record) => record.frontmatter!.id),
  ];
  const missingPackageTypes = deriveMissingPackageTypes({
    trancheStatus: tranche.status,
    planPackageCount: planPackages.length,
    executionPackageCount: executionPackages.length,
  });
  const content = [
    "---",
    `id: ${id}`,
    `source_tranche: ${tranche.id}`,
    `status: ${status}`,
    `review_reason: ${tranche.review_trigger}`,
    `generated_on: ${today()}`,
    `related_decisions: ${formatInlineList(relatedDecisions.map((decision) => decision.id))}`,
    `related_packages: ${formatInlineList(relatedPackageIds)}`,
    `drift_signals: ${formatInlineList(detectedSignals)}`,
    "---",
    "",
    "# Summary",
    "",
    status === "attention_required"
      ? `Review checkpoint found ${findings.length} issue(s) requiring follow-up.`
      : "Review checkpoint found no durable drift requiring follow-up.",
    "",
    "# Trigger",
    "",
    `- Trigger reason: ${tranche.review_trigger}.`,
    `- Tranche status at review time: ${tranche.status}.`,
    `- Acceptance status at review time: ${tranche.acceptance_status}.`,
    ...formatRepositoryState(repositoryState),
    "",
    "# Package Coverage",
    "",
    `- Plan packages: ${planPackages.length}.`,
    `- Execution packages: ${executionPackages.length}.`,
    ...(relatedPackageIds.length > 0
      ? relatedPackageIds.map((packageId) => `- Related package: ${packageId}.`)
      : ["- No persisted handoff packages linked to this tranche."]),
    "",
    "# Drift Signals",
    "",
    ...(detectedSignals.length > 0
      ? detectedSignals.map((signal) => `- ${signal}.`)
      : ["- No configured drift signals detected."]),
    "",
    "# Findings",
    "",
    ...findings.map((finding) => `- ${finding}`),
    "",
    "# Recommended Actions",
    "",
    ...recommendedActions.map((action) => `- ${action}`),
    "",
    "# Durable Changes",
    "",
    ...(status === "attention_required"
      ? [
          "- No automatic meaning-bearing artefact rewrites were applied.",
          "- Convert accepted follow-up actions into tranche, decision, or glossary updates.",
        ]
      : ["- No durable repository change required from this checkpoint."]),
    "",
  ].join("\n");

  return {
    id,
    relativePath: `docs/reviews/${id}.md`,
    record: {
      id,
      source_tranche: tranche.id,
      status,
      related_packages: relatedPackageIds,
      drift_signals: detectedSignals,
      missing_package_types: missingPackageTypes,
    },
    path: `docs/reviews/${id}.md`,
    content,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
