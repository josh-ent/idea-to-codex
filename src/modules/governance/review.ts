import fs from "node:fs/promises";
import path from "node:path";

import {
  collectValidationErrors,
  loadTranche,
  type RepositoryValidation,
  validateRepository,
} from "../artifacts/repository.js";
import { driftSignals } from "./policy.js";

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
  const planPackages = validation.planPackages.filter(
    (record) =>
      record.frontmatter?.source_tranche === tranche.id && record.errors.length === 0,
  );
  const executionPackages = validation.executionPackages.filter(
    (record) =>
      record.frontmatter?.source_tranche === tranche.id && record.errors.length === 0,
  );
  const glossaryTerms = new Set(validation.glossaryTerms.map((term) => term.term));
  const missingTerms = tranche.related_terms.filter((term) => !glossaryTerms.has(term));
  const validationErrors = collectValidationErrors(validation);
  const detectedSignals = detectDriftSignals({
    tranche,
    planPackageCount: planPackages.length,
    executionPackageCount: executionPackages.length,
    missingTerms,
    relatedDecisionCount: relatedDecisions.length,
  });
  const findings = buildFindings({
    validationErrors,
    planPackages,
    executionPackages,
    missingTerms,
    architectureDecisionMissing:
      tranche.affected_artifacts.includes("ARCHITECTURE.md") && relatedDecisions.length === 0,
  });
  const recommendedActions = buildRecommendedActions({
    tranche,
    detectedSignals,
    missingTerms,
    validationErrors,
    planPackages,
    executionPackages,
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

  return unique(signals);
}

function buildFindings(input: {
  validationErrors: string[];
  planPackages: RepositoryValidation["planPackages"];
  executionPackages: RepositoryValidation["executionPackages"];
  missingTerms: string[];
  architectureDecisionMissing: boolean;
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

  return findings.length > 0 ? findings : ["No durable drift findings detected."];
}

function buildRecommendedActions(input: {
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>;
  detectedSignals: string[];
  missingTerms: string[];
  validationErrors: string[];
  planPackages: RepositoryValidation["planPackages"];
  executionPackages: RepositoryValidation["executionPackages"];
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

  return actions.length > 0
    ? actions
    : ["Keep the current tranche state and repository truth as-is."];
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
