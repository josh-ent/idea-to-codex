import type { RepositoryState } from "../artifacts/git.js";
import type { RepositoryValidation } from "../artifacts/repository.js";
import type { TrancheFrontmatter } from "../artifacts/schemas.js";
import { reviewDriftSignals } from "./policy.js";

type PackageRecord = RepositoryValidation["planPackages"][number];

export function detectDriftSignals(input: {
  tranche: TrancheFrontmatter;
  planPackageCount: number;
  executionPackageCount: number;
  missingTerms: string[];
  relatedDecisionCount: number;
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: number;
  workflowPlaceholderFields: number;
  packageAlignmentDrift: number;
  hasExecutionConductDrift: boolean;
}): string[] {
  const signals: string[] = [];

  if (
    input.planPackageCount > 0 &&
    input.executionPackageCount === 0 &&
    (input.tranche.status === "approved" || input.tranche.status === "in_progress")
  ) {
    signals.push(reviewDriftSignals.docsOutpacedImplementation);
  }

  if (input.tranche.status === "complete" && input.executionPackageCount === 0) {
    signals.push(reviewDriftSignals.implementationOutpacedDocs);
  }

  if (input.missingTerms.length > 0) {
    signals.push(reviewDriftSignals.terminologyDriftDetected);
  }

  if (
    input.tranche.affected_artifacts.includes("ARCHITECTURE.md") &&
    input.relatedDecisionCount === 0
  ) {
    signals.push(reviewDriftSignals.architectureIntentDriftDetected);
  }

  if (input.missingWorkflowFields.length > 0) {
    signals.push(reviewDriftSignals.workflowContextMissingOrIncomplete);
  }

  if (input.packagesMissingWorkflowContext > 0) {
    signals.push(reviewDriftSignals.workflowContextNotPropagatedIntoPackages);
  }

  if (input.workflowPlaceholderFields > 0) {
    signals.push(reviewDriftSignals.workflowContextStillUsesPlaceholderValues);
  }

  if (input.packageAlignmentDrift > 0) {
    signals.push(reviewDriftSignals.packageAlignmentDriftDetected);
  }

  if (input.hasExecutionConductDrift) {
    signals.push(reviewDriftSignals.executionConductDriftDetected);
  }

  return [...new Set(signals)];
}

export function buildFindings(input: {
  validationErrors: string[];
  planPackages: PackageRecord[];
  executionPackages: PackageRecord[];
  missingTerms: string[];
  architectureDecisionMissing: boolean;
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: PackageRecord[];
  workflowPlaceholderFields: string[];
  packageAlignmentDrift: string[];
  repositoryState: RepositoryState;
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

  if (input.packageAlignmentDrift.length > 0) {
    findings.push(
      `Linked packages are stale relative to current tranche truth: ${input.packageAlignmentDrift.join(", ")}.`,
    );
  }

  if (input.repositoryState.available && input.repositoryState.is_dirty) {
    findings.push(
      `Repository has uncommitted changes: ${input.repositoryState.dirty_paths.join(", ")}.`,
    );
  }

  if (
    input.repositoryState.available &&
    input.repositoryState.is_dirty &&
    input.repositoryState.is_main_branch
  ) {
    findings.push("Repository is dirty on main; execution conduct requires branch or worktree isolation.");
  }

  return findings.length > 0 ? findings : ["No durable drift findings detected."];
}

export function buildRecommendedActions(input: {
  tranche: TrancheFrontmatter;
  detectedSignals: string[];
  missingTerms: string[];
  validationErrors: string[];
  planPackages: PackageRecord[];
  executionPackages: PackageRecord[];
  missingWorkflowFields: string[];
  packagesMissingWorkflowContext: PackageRecord[];
  workflowPlaceholderFields: string[];
  packageAlignmentDrift: string[];
  repositoryState: RepositoryState;
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

  if (input.detectedSignals.includes(reviewDriftSignals.architectureIntentDriftDetected)) {
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

  if (input.packageAlignmentDrift.length > 0) {
    actions.push(
      `Regenerate the stale package set with \`npm run package:refresh -- ${input.tranche.id}\` or the operator-console refresh action so persisted handoffs realign with current tranche truth.`,
    );
  }

  if (input.repositoryState.available && input.repositoryState.is_dirty) {
    actions.push("Checkpoint the current repository changes in a commit before treating execution as review-ready.");
  }

  if (
    input.repositoryState.available &&
    input.repositoryState.is_dirty &&
    input.repositoryState.is_main_branch
  ) {
    actions.push("Move active implementation work onto a branch or worktree instead of leaving dirty state on main.");
  }

  return actions.length > 0
    ? actions
    : ["Keep the current tranche state and repository truth as-is."];
}

export function deriveMissingPackageTypes(input: {
  trancheStatus: TrancheFrontmatter["status"];
  planPackageCount: number;
  executionPackageCount: number;
}): Array<"plan" | "execution"> {
  const packageTypes: Array<"plan" | "execution"> = [];

  if (input.planPackageCount === 0) {
    packageTypes.push("plan");
  }

  if (input.executionPackageCount === 0 && input.trancheStatus !== "proposed") {
    packageTypes.push("execution");
  }

  return packageTypes;
}

export function formatRepositoryState(repositoryState: RepositoryState): string[] {
  if (!repositoryState.available) {
    return ["- Repository state at review time: unavailable."];
  }

  return [
    `- Repository branch at review time: ${repositoryState.branch ?? "detached"}.`,
    `- Repository head at review time: ${repositoryState.head ?? "unknown"}.`,
    `- Repository dirty at review time: ${repositoryState.is_dirty ? "yes" : "no"}.`,
  ];
}
