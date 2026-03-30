import fs from "node:fs/promises";
import path from "node:path";

import {
  collectValidationErrors,
  loadTranche,
  sectionContent,
  type RepositoryValidation,
  validateRepository,
} from "../artifacts/repository.js";
import { driftSignals } from "./policy.js";
import {
  findWorkflowPlaceholderFields,
  hasWorkflowContext,
  missingWorkflowFields as findMissingWorkflowFields,
  workflowContextLines,
} from "./workflow.js";

export interface GeneratedReview {
  id: string;
  relativePath: string;
  record: {
    id: string;
    source_tranche: string;
    status: "recorded" | "attention_required";
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
  const review = buildReviewRecord(validation, tranche);

  if (persist) {
    const absolutePath = path.join(rootDir, review.relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, review.content, "utf8");
  }

  return review;
}

function buildReviewRecord(
  validation: RepositoryValidation,
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>,
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
    ? [...planPackageRecords, ...executionPackageRecords].filter(
        (record) => !packageContainsWorkflowContext(record.content, workflowContext),
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
    },
    path: `docs/reviews/${id}.md`,
    content,
  };
}

function detectDriftSignals(input: {
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>;
  planPackageCount: number;
  executionPackageCount: number;
  missingTerms: string[];
  relatedDecisionCount: number;
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: number;
  workflowPlaceholderFields: number;
}): string[] {
  const signals: string[] = [];

  if (
    input.planPackageCount > 0 &&
    input.executionPackageCount === 0 &&
    (input.tranche.status === "approved" || input.tranche.status === "in_progress")
  ) {
    signals.push(driftSignals[1]);
  }

  if (
    input.tranche.status === "complete" &&
    input.executionPackageCount === 0
  ) {
    signals.push(driftSignals[0]);
  }

  if (input.missingTerms.length > 0) {
    signals.push(driftSignals[2]);
  }

  if (
    input.tranche.affected_artifacts.includes("ARCHITECTURE.md") &&
    input.relatedDecisionCount === 0
  ) {
    signals.push(driftSignals[3]);
  }

  if (input.missingWorkflowFields.length > 0) {
    signals.push(driftSignals[4]);
  }

  if (input.packagesMissingWorkflowContext > 0) {
    signals.push(driftSignals[5]);
  }

  if (input.workflowPlaceholderFields > 0) {
    signals.push(driftSignals[6]);
  }

  return unique(signals);
}

function buildFindings(input: {
  validationErrors: string[];
  planPackages: RepositoryValidation["planPackages"];
  executionPackages: RepositoryValidation["executionPackages"];
  missingTerms: string[];
  architectureDecisionMissing: boolean;
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: RepositoryValidation["planPackages"];
  workflowPlaceholderFields: string[];
}): string[] {
  const findings: string[] = [];

  for (const error of input.validationErrors) {
    findings.push(`Validation issue: ${error}`);
  }

  if (input.planPackages.length === 0) {
    findings.push("No persisted plan package exists for this tranche.");
  }

  if (input.executionPackages.length === 0) {
    findings.push("No persisted execution package exists for this tranche.");
  }

  if (input.missingTerms.length > 0) {
    findings.push(
      `Missing glossary terms for linked tranche terminology: ${input.missingTerms.join(", ")}.`,
    );
  }

  if (input.architectureDecisionMissing) {
    findings.push(
      "ARCHITECTURE.md is in scope but no linked decision record explains the intended boundary change.",
    );
  }

  if (input.missingWorkflowFields.length > 0) {
    findings.push(
      `Workflow context is missing required tranche fields: ${input.missingWorkflowFields.join(", ")}.`,
    );
  }

  if (input.packagesMissingWorkflowContext.length > 0) {
    findings.push(
      `Linked packages are missing or out of sync with Workflow Context: ${input.packagesMissingWorkflowContext
        .map((record) => record.frontmatter?.id ?? record.path)
        .join(", ")}.`,
    );
  }

  if (input.workflowPlaceholderFields.length > 0) {
    findings.push(
      `Workflow context still uses placeholder values in: ${input.workflowPlaceholderFields.join(", ")}.`,
    );
  }

  return findings.length > 0 ? findings : ["No durable drift findings detected."];
}

function buildRecommendedActions(input: {
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>;
  detectedSignals: string[];
  missingTerms: string[];
  validationErrors: string[];
  planPackages: RepositoryValidation["planPackages"];
  executionPackages: RepositoryValidation["executionPackages"];
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: RepositoryValidation["planPackages"];
  workflowPlaceholderFields: string[];
}): string[] {
  const actions: string[] = [];

  if (input.validationErrors.length > 0) {
    actions.push("Resolve repository validation errors before the next tranche proceeds.");
  }

  if (input.planPackages.length === 0) {
    actions.push("Generate and review a plan package before treating the tranche as execution-ready.");
  }

  if (input.executionPackages.length === 0 && input.tranche.status !== "proposed") {
    actions.push("Generate an execution package or lower the tranche status until execution is actually ready.");
  }

  if (input.missingTerms.length > 0) {
    actions.push("Add the missing glossary terms before more docs or UI copy reuse them.");
  }

  if (input.detectedSignals.includes(driftSignals[3])) {
    actions.push("Capture the architecture change in a decision record linked to the tranche.");
  }

  if (input.missingWorkflowFields.length > 0) {
    actions.push("Record Actor, Use Case, Goal, and Constraints on the tranche before more workflow critique proceeds.");
  }

  if (input.packagesMissingWorkflowContext.length > 0) {
    actions.push("Regenerate linked handoff packages so Workflow Context matches the tranche.");
  }

  if (input.workflowPlaceholderFields.length > 0) {
    actions.push("Replace placeholder workflow values with concrete Actor, Use Case, Goal, and Constraint wording.");
  }

  return actions.length > 0
    ? actions
    : ["Keep the current tranche state and repository truth as-is."];
}

function packageContainsWorkflowContext(
  markdown: string,
  workflowContext: Parameters<typeof workflowContextLines>[0],
): boolean {
  const workflowSection = sectionContent(markdown, "Workflow Context");

  if (!workflowSection) {
    return false;
  }

  return workflowContextLines(workflowContext).every((line) => workflowSection.includes(line));
}

function formatInlineList(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
