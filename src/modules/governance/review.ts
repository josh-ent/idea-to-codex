import fs from "node:fs/promises";
import path from "node:path";

import { getRepositoryState } from "../artifacts/git.js";
import {
  collectValidationErrors,
  loadTranche,
  sectionContent,
  type RepositoryValidation,
  validateRepository,
} from "../artifacts/repository.js";
import { driftSignals } from "./policy.js";
import { generatePackage } from "../packaging/service.js";
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
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>,
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

function detectDriftSignals(input: {
  tranche: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>;
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

  if (input.packageAlignmentDrift > 0) {
    signals.push(driftSignals[7]);
  }

  if (input.hasExecutionConductDrift) {
    signals.push(driftSignals[8]);
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
  packageAlignmentDrift: string[];
  repositoryState: Awaited<ReturnType<typeof getRepositoryState>>;
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
  packageAlignmentDrift: string[];
  repositoryState: Awaited<ReturnType<typeof getRepositoryState>>;
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

function deriveMissingPackageTypes(input: {
  trancheStatus: NonNullable<Awaited<ReturnType<typeof loadTranche>>["frontmatter"]>["status"];
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

function formatRepositoryState(
  repositoryState: Awaited<ReturnType<typeof getRepositoryState>>,
): string[] {
  if (!repositoryState.available) {
    return ["- Repository state at review time: unavailable."];
  }

  return [
    `- Repository branch at review time: ${repositoryState.branch ?? "detached"}.`,
    `- Repository head at review time: ${repositoryState.head ?? "unknown"}.`,
    `- Repository dirty at review time: ${repositoryState.is_dirty ? "yes" : "no"}.`,
  ];
}

async function findPackageAlignmentDrift(
  rootDir: string,
  trancheId: string,
  validation: RepositoryValidation,
): Promise<string[]> {
  const drifts: string[] = [];
  const expectedContentByType = new Map<"plan" | "execution", string>();

  for (const type of ["plan", "execution"] as const) {
    const records =
      type === "plan"
        ? validation.planPackages
        : validation.executionPackages;
    const linkedPackages = records.filter(
      (record) =>
        record.frontmatter?.source_tranche === trancheId &&
        record.errors.length === 0,
    );

    if (linkedPackages.length === 0) {
      continue;
    }

    if (!expectedContentByType.has(type)) {
      expectedContentByType.set(
        type,
        (await generatePackage(rootDir, type, trancheId, false)).content.trim(),
      );
    }

    const expectedContent = expectedContentByType.get(type)!;

    for (const record of linkedPackages) {
      const persistedContent = await fs.readFile(path.resolve(process.cwd(), record.path), "utf8");

      if (persistedContent.trim() !== expectedContent) {
        drifts.push(record.frontmatter?.id ?? record.path);
      }
    }
  }

  return drifts;
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
