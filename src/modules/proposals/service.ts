import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import {
  extractBulletItems,
  extractMarkdownCodeFence,
} from "../artifacts/markdown.js";
import {
  collectValidationErrors,
  loadProposalDraftRecords,
  loadProposalSetRecords,
  loadTranche,
  readText,
  sectionContent,
  validateRepository,
  type ValidatedRecord,
} from "../artifacts/repository.js";
import type {
  ProposalDraftFrontmatter,
  ProposalSetFrontmatter,
} from "../artifacts/schemas.js";
import { generateReview } from "../governance/review.js";
import {
  isWorkflowQuestionType,
  normalizeWorkflowConstraints,
  type WorkflowContext,
} from "../governance/workflow.js";
import { analyzeRequest } from "../intake/service.js";
import {
  buildAssumptionsProposal,
  buildBacklogProposal,
  buildDecisionRecord,
  buildGlossaryProposal,
  buildProposalDraftMarkdown,
  buildProposalSetMarkdown,
  buildTrancheRecord,
  slugify,
  type ProposalDraftInput,
} from "./builders.js";
import { deriveProposalSetStatus } from "./status.js";

export interface ProposalDraftDetail {
  id: string;
  relativePath: string;
  record: ProposalDraftFrontmatter;
  summary: string;
  sourceContext: string;
  proposedContent: string;
  content: string;
}

export interface ProposalSetSummary {
  id: string;
  relativePath: string;
  record: ProposalSetFrontmatter;
  draft_count: number;
}

export interface ProposalSetDetail {
  id: string;
  relativePath: string;
  record: ProposalSetFrontmatter;
  summary: string;
  sourceContext: string;
  draftsSection: string;
  drafts: ProposalDraftDetail[];
  content: string;
}

export interface ProposalMutationResult {
  proposal_set_id: string;
  proposal_id: string;
  status: ProposalDraftFrontmatter["status"];
  target_artifact: string;
}

export async function listProposalSets(rootDir: string): Promise<ProposalSetSummary[]> {
  const [proposalSets, proposalDrafts] = await Promise.all([
    loadProposalSetRecords(rootDir),
    loadProposalDraftRecords(rootDir),
  ]);

  return proposalSets
    .filter((record) => record.frontmatter && record.errors.length === 0)
    .map((record) => ({
      id: record.frontmatter!.id,
      relativePath: record.path,
      record: record.frontmatter!,
      draft_count: proposalDrafts.filter(
        (draft) =>
          draft.frontmatter?.proposal_set_id === record.frontmatter!.id &&
          draft.errors.length === 0,
      ).length,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function getProposalSet(
  rootDir: string,
  proposalSetId: string,
): Promise<ProposalSetDetail> {
  const [proposalSets, proposalDrafts] = await Promise.all([
    loadProposalSetRecords(rootDir),
    loadProposalDraftRecords(rootDir),
  ]);
  const proposalSet = requireValidRecord(
    proposalSets.find((record) => record.frontmatter?.id === proposalSetId),
    `Unknown proposal set: ${proposalSetId}`,
  );
  const drafts = proposalDrafts
    .filter(
      (record) =>
        record.frontmatter?.proposal_set_id === proposalSetId &&
        record.errors.length === 0,
    )
    .map((record) => toProposalDraftDetail(record))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    id: proposalSet.frontmatter.id,
    relativePath: proposalSet.path,
    record: proposalSet.frontmatter,
    summary: sectionContent(proposalSet.content, "Summary"),
    sourceContext: sectionContent(proposalSet.content, "Source Context"),
    draftsSection: sectionContent(proposalSet.content, "Drafts"),
    drafts,
    content: proposalSet.content,
  };
}

export async function generateIntakeProposalSet(
  rootDir: string,
  requestText: string,
  answers: Record<string, string>,
): Promise<ProposalSetDetail> {
  const validation = await requireCleanRepository(rootDir);
  const analysis = analyzeRequest(requestText);
  const unanswered = analysis.material_questions.filter(
    (question) => question.blocking && !answers[question.id]?.trim(),
  );

  if (unanswered.length > 0) {
    throw new Error(
      `Unanswered blocking material questions: ${unanswered
        .map((question) => question.id)
        .join(", ")}`,
    );
  }

  const setId = nextIdentifier(
    validation.proposalSets
      .map((record) => record.frontmatter?.id)
      .filter((value): value is string => Boolean(value)),
    "PROPOSAL",
  );
  const sourceRef = `INTAKE-${setId}`;
  const trancheId = nextIdentifier(
    validation.tranches
      .map((record) => record.frontmatter?.id)
      .filter((value): value is string => Boolean(value)),
    "TRANCHE",
  );
  const decisionNeeded = analysis.material_questions.some(
    (question) => question.type === "architecture_direction",
  );
  const workflowContext = deriveWorkflowContext(analysis, answers);
  const glossaryTerms = deduplicateGlossaryTerms([
    ...(analysis.material_questions.some(
      (question) => question.type === "terminology_integrity",
    )
      ? deriveGlossaryTerms(requestText, answers)
      : []),
    ...deriveWorkflowGlossaryTerms(
      validation.glossaryTerms.map((term) => term.term),
      workflowContext,
    ),
  ]);
  const assumptionEntries = deriveAssumptions(
    analysis.summary,
    analysis.draft_assumptions,
    analysis.material_questions,
    answers,
  );
  const nextAssumptionIds = assignSequentialIds(
    validation.assumptions.map((assumption) => assumption.id),
    "A",
    assumptionEntries.length,
  );
  const assumptions = assumptionEntries.map((text, index) => ({
    id: nextAssumptionIds[index],
    text,
  }));
  const decisionId = decisionNeeded
    ? nextIdentifier(
        validation.decisions
          .map((record) => record.frontmatter?.id)
          .filter((value): value is string => Boolean(value)),
        "DEC",
      )
    : null;
  const trancheTitle = analysis.recommended_tranche_title;
  const trancheSlug = slugify(trancheTitle);
  const tranchePath = `docs/tranches/${trancheId}-${trancheSlug}.md`;
  const decisionPath = decisionId
    ? `docs/decisions/${decisionId}-${slugify(`boundary for ${trancheTitle}`)}.md`
    : null;

  const draftInputs: ProposalDraftInput[] = [
    {
      fileName: "backlog.md",
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "intake",
        sourceRef,
        suffix: "BACKLOG",
        targetArtifact: "BACKLOG.md",
        targetKind: "top_level",
      }),
      summary: `Add ${trancheId} to the backlog so the intake request becomes a durable tranche candidate.`,
      sourceContext: [
        `- Intake summary: ${analysis.summary}`,
        `- Recommended tranche title: ${trancheTitle}`,
      ],
      proposedContent: buildBacklogProposal(
        await readText(rootDir, "BACKLOG.md"),
        trancheId,
        trancheTitle,
      ),
    },
    {
      fileName: `tranche-${trancheId.toLowerCase()}.md`,
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "intake",
        sourceRef,
        suffix: trancheId,
        targetArtifact: tranchePath,
        targetKind: "record",
      }),
      summary: `Create ${trancheId} as the durable tranche record for the approved intake request.`,
      sourceContext: [
        `- Intake summary: ${analysis.summary}`,
        ...formatAnswerLines(answers),
      ],
      proposedContent: buildTrancheRecord({
        id: trancheId,
        title: trancheTitle,
        status: "proposed",
        priority: "high",
        goal: analysis.summary,
        affectedArtifacts: unique([
          "BACKLOG.md",
          ...(assumptions.length > 0 ? ["ASSUMPTIONS.md"] : []),
          ...(glossaryTerms.length > 0 ? ["GLOSSARY.md"] : []),
          ...(decisionPath ? [decisionPath] : []),
          tranchePath,
        ]),
        affectedModules: analysis.affected_modules.length > 0 ? analysis.affected_modules : ["intake"],
        relatedDecisions: decisionId ? [decisionId] : [],
        relatedAssumptions: assumptions.map((assumption) => assumption.id),
        relatedTerms: unique([
          ...(workflowContext ? ["Actor", "Use Case"] : []),
        ]),
        actor: workflowContext?.actor,
        useCase: workflowContext?.use_case,
        actorGoal: workflowContext?.actor_goal,
        useCaseConstraints: workflowContext?.use_case_constraints,
        reviewTrigger: "tranche_complete",
        acceptanceStatus: "not_started",
        scope: [
          "Capture the approved intake request as durable repository truth.",
          "Prepare the tranche for plan and execution package generation.",
        ],
        outOfScope: [
          "Automatic persistence of meaning-bearing artefacts without approval.",
          "Direct Codex execution from the platform.",
        ],
        preconditions: [
          "Blocking Material Questions for this request have explicit operator answers.",
          "Repository validation remains clean before approval.",
        ],
        acceptanceCriteria: [
          "The request is represented by a durable tranche record.",
          "Affected artefacts and modules are explicit enough for package generation.",
        ],
        risks: [
          "Approving the tranche before sibling glossary or decision drafts may leave temporary drift.",
        ],
        notes: [
          "Generated from intake analysis and operator-provided answers.",
        ],
      }),
    },
  ];

  if (assumptions.length > 0) {
    draftInputs.push({
      fileName: "assumptions.md",
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "intake",
        sourceRef,
        suffix: "ASSUMPTIONS",
        targetArtifact: "ASSUMPTIONS.md",
        targetKind: "top_level",
      }),
      summary: `Add ${assumptions.length} active assumption(s) needed to preserve the approved intake context.`,
      sourceContext: [
        `- Intake summary: ${analysis.summary}`,
        ...formatAnswerLines(answers),
      ],
      proposedContent: buildAssumptionsProposal(
        await readText(rootDir, "ASSUMPTIONS.md"),
        assumptions,
      ),
    });
  }

  if (glossaryTerms.length > 0) {
    draftInputs.push({
      fileName: "glossary.md",
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "intake",
        sourceRef,
        suffix: "GLOSSARY",
        targetArtifact: "GLOSSARY.md",
        targetKind: "top_level",
      }),
      summary: `Add or update ${glossaryTerms.length} glossary term(s) before terminology drifts into prompts or UI copy.`,
      sourceContext: [
        `- Intake summary: ${analysis.summary}`,
        ...formatAnswerLines(answers),
      ],
      proposedContent: buildGlossaryProposal(
        await readText(rootDir, "GLOSSARY.md"),
        glossaryTerms,
      ),
    });
  }

  if (decisionId && decisionPath) {
    draftInputs.push({
      fileName: `decision-${decisionId.toLowerCase()}.md`,
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "intake",
        sourceRef,
        suffix: decisionId,
        targetArtifact: decisionPath,
        targetKind: "record",
      }),
      summary: `Capture the architecture boundary change as ${decisionId} before implementation spreads implicit ownership assumptions.`,
      sourceContext: [
        `- Intake summary: ${analysis.summary}`,
        ...formatAnswerLines(answers),
      ],
      proposedContent: buildDecisionRecord({
        id: decisionId,
        title: `Boundary for ${trancheTitle}`,
        status: "proposed",
        date: today(),
        owners: ["project-lead"],
        relatedTranches: [trancheId],
        affectedArtifacts: unique(["ARCHITECTURE.md", "PLAN.md", tranchePath]),
        supersedes: [],
        tags: ["architecture", "proposal"],
        context: [
          "The intake request affects architecture direction and needs an explicit boundary decision.",
          `Request summary: ${analysis.summary}`,
        ],
        decision: [
          `Use ${analysis.affected_modules.join(", ") || "the current modules"} as the initial ownership boundary for ${trancheTitle}.`,
          "Keep durable truth writes backend-owned and approval-gated.",
        ],
        options: [
          "Proceed without a decision record and let the implementation imply the boundary.",
          "Capture the boundary explicitly before execution work starts.",
        ],
        consequences: [
          "Codex handoff packaging can reference a durable architecture choice.",
          "The operator can approve or reject the boundary change independently.",
        ],
        followUp: [
          "Approve the linked tranche and glossary proposals in the same change set if they remain coherent.",
        ],
      }),
    });
  }

  return writeProposalSet(rootDir, {
    id: setId,
    sourceType: "intake",
    sourceRef,
    summary: `Draft proposals generated from intake request: ${analysis.summary}`,
    sourceContext: [
      `- Raw request: ${requestText.trim() || "No request provided."}`,
      ...formatAnswerLines(answers),
    ],
    drafts: draftInputs,
  });
}

export async function generateReviewProposalSet(
  rootDir: string,
  trancheId: string,
): Promise<ProposalSetDetail> {
  const validation = await requireCleanRepository(rootDir);
  const trancheRecord = await loadTranche(rootDir, trancheId);
  const tranche = trancheRecord.frontmatter!;
  const review = await generateReview(rootDir, trancheId, false);
  const setId = nextIdentifier(
    validation.proposalSets
      .map((record) => record.frontmatter?.id)
      .filter((value): value is string => Boolean(value)),
    "PROPOSAL",
  );
  const sourceRef = review.record.id;
  const glossaryIndex = new Set(validation.glossaryTerms.map((term) => term.term));
  const missingTerms = tranche.related_terms.filter((term) => !glossaryIndex.has(term));
  const nextDecisionId = nextIdentifier(
    validation.decisions
      .map((record) => record.frontmatter?.id)
      .filter((value): value is string => Boolean(value)),
    "DEC",
  );
  const decisionPath = `docs/decisions/${nextDecisionId}-${slugify(`follow up for ${tranche.id}`)}.md`;
  const draftInputs: ProposalDraftInput[] = [];

  if (missingTerms.length > 0) {
    draftInputs.push({
      fileName: "glossary.md",
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "review",
        sourceRef,
        suffix: "GLOSSARY",
        targetArtifact: "GLOSSARY.md",
        targetKind: "top_level",
      }),
      summary: `Add ${missingTerms.length} missing glossary term(s) surfaced by ${review.record.id}.`,
      sourceContext: [
        `- Review source: ${review.record.id}`,
        ...extractBulletItems(review.content, "Findings").map((item) => `- ${item}`),
      ],
      proposedContent: buildGlossaryProposal(
        await readText(rootDir, "GLOSSARY.md"),
        missingTerms.map((term) => ({
          term,
          definition: `Glossary term referenced by ${tranche.id} and surfaced during review.`,
          notes: `Added from ${review.record.id} to remove terminology drift.`,
        })),
      ),
    });
  }

  if (
    tranche.affected_artifacts.includes("ARCHITECTURE.md") &&
    tranche.related_decisions.length === 0
  ) {
    draftInputs.push({
      fileName: `decision-${nextDecisionId.toLowerCase()}.md`,
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "review",
        sourceRef,
        suffix: nextDecisionId,
        targetArtifact: decisionPath,
        targetKind: "record",
      }),
      summary: `Create ${nextDecisionId} to explain the architecture boundary drift surfaced by ${review.record.id}.`,
      sourceContext: [
        `- Review source: ${review.record.id}`,
        ...extractBulletItems(review.content, "Recommended Actions").map((item) => `- ${item}`),
      ],
      proposedContent: buildDecisionRecord({
        id: nextDecisionId,
        title: `Architecture follow-up for ${tranche.id}`,
        status: "proposed",
        date: today(),
        owners: ["project-lead"],
        relatedTranches: [tranche.id],
        affectedArtifacts: unique(["ARCHITECTURE.md", toRootRelativePath(rootDir, trancheRecord.path)]),
        supersedes: [],
        tags: ["architecture", "review"],
        context: [
          `Review ${review.record.id} found that ${tranche.id} affects ARCHITECTURE.md without a linked decision.`,
        ],
        decision: [
          `Capture the intended architecture boundary for ${tranche.id} before more implementation proceeds.`,
        ],
        options: [
          "Continue without a linked decision.",
          "Persist the boundary decision and link it to the tranche.",
        ],
        consequences: [
          "Architecture intent becomes explicit again.",
          "Future package generation can reference a durable decision record.",
        ],
        followUp: [
          `Link ${tranche.id} to ${nextDecisionId} if the proposal is approved.`,
        ],
      }),
    });
  }

  if (
    !validation.executionPackages.some(
      (record) =>
        record.frontmatter?.source_tranche === tranche.id && record.errors.length === 0,
    ) &&
    (tranche.status === "approved" || tranche.status === "in_progress")
  ) {
    draftInputs.push({
      fileName: `tranche-${tranche.id.toLowerCase()}.md`,
      frontmatter: buildDraftFrontmatter({
        setId,
        sourceType: "review",
        sourceRef,
        suffix: tranche.id,
        targetArtifact: toRootRelativePath(rootDir, trancheRecord.path),
        targetKind: "record",
      }),
      summary: `Lower ${tranche.id} back to proposed until its execution package exists.`,
      sourceContext: [
        `- Review source: ${review.record.id}`,
        ...extractBulletItems(review.content, "Recommended Actions").map((item) => `- ${item}`),
      ],
      proposedContent: buildTrancheRecord({
        id: tranche.id,
        title: tranche.title,
        status: "proposed",
        priority: tranche.priority,
        goal: tranche.goal,
        affectedArtifacts: tranche.affected_artifacts,
        affectedModules: tranche.affected_modules,
        relatedDecisions: tranche.related_decisions,
        relatedAssumptions: tranche.related_assumptions,
        relatedTerms: tranche.related_terms,
        actor: tranche.actor,
        useCase: tranche.use_case,
        actorGoal: tranche.actor_goal,
        useCaseConstraints: tranche.use_case_constraints,
        reviewTrigger: tranche.review_trigger,
        acceptanceStatus: "pending",
        scope: bulletLines(trancheRecord.content, "Scope"),
        outOfScope: bulletLines(trancheRecord.content, "Out of scope"),
        preconditions: bulletLines(trancheRecord.content, "Preconditions"),
        acceptanceCriteria: bulletLines(trancheRecord.content, "Acceptance criteria"),
        risks: unique([
          ...bulletLines(trancheRecord.content, "Risks / tensions"),
          `Review ${review.record.id} found no execution package for the current tranche state.`,
        ]),
        notes: unique([
          ...bulletLines(trancheRecord.content, "Notes"),
          `Proposed from ${review.record.id} to keep tranche status aligned with package coverage.`,
        ]),
      }),
    });
  }

  if (draftInputs.length === 0) {
    throw new Error(`No supported proposal drafts were derived from ${review.record.id}`);
  }

  return writeProposalSet(rootDir, {
    id: setId,
    sourceType: "review",
    sourceRef,
    summary: `Draft proposals generated from ${review.record.id}.`,
    sourceContext: [
      ...extractBulletItems(review.content, "Findings").map((item) => `- ${item}`),
      ...extractBulletItems(review.content, "Recommended Actions").map((item) => `- ${item}`),
    ],
    drafts: draftInputs,
  });
}

export async function approveProposalDraft(
  rootDir: string,
  proposalId: string,
): Promise<ProposalMutationResult> {
  return applyProposalMutation(rootDir, proposalId, "approved");
}

export async function rejectProposalDraft(
  rootDir: string,
  proposalId: string,
): Promise<ProposalMutationResult> {
  return applyProposalMutation(rootDir, proposalId, "rejected");
}

async function applyProposalMutation(
  rootDir: string,
  proposalId: string,
  nextStatus: "approved" | "rejected",
): Promise<ProposalMutationResult> {
  const draftRecords = await loadProposalDraftRecords(rootDir);
  const draft = requireValidRecord(
    draftRecords.find(
      (record) => record.frontmatter?.id === proposalId,
    ),
    `Unknown proposal draft: ${proposalId}`,
  );
  const proposalSet = requireValidRecord(
    (await loadProposalSetRecords(rootDir)).find(
      (record) => record.frontmatter?.id === draft.frontmatter.proposal_set_id,
    ),
    `Unknown proposal set: ${draft.frontmatter.proposal_set_id}`,
  );
  const previousDraftStatus = draft.frontmatter.status;
  const previousProposalSetStatus = proposalSet.frontmatter.status;

  if (nextStatus === "approved") {
    const proposedContent = extractMarkdownCodeFence(
      sectionContent(draft.content, "Proposed Content"),
    );
    const targetPath = path.join(rootDir, draft.frontmatter.target_artifact);
    const previousContent = await readOptionalFile(targetPath);

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, proposedContent, "utf8");
      await writeFrontmatterStatus(resolveRecordPath(rootDir, draft.path), nextStatus);
      await refreshProposalSetStatus(rootDir, draft.frontmatter.proposal_set_id);
      await requireCleanRepository(rootDir);
    } catch (error) {
      await restoreTargetArtifact(targetPath, previousContent);
      await writeFrontmatterStatus(resolveRecordPath(rootDir, draft.path), previousDraftStatus);
      await writeFrontmatterStatus(
        resolveRecordPath(rootDir, proposalSet.path),
        previousProposalSetStatus,
      );
      throw new Error(
        `approving ${proposalId} would leave the repository invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  } else {
    await writeFrontmatterStatus(resolveRecordPath(rootDir, draft.path), nextStatus);
    await refreshProposalSetStatus(rootDir, draft.frontmatter.proposal_set_id);
  }

  return {
    proposal_set_id: draft.frontmatter.proposal_set_id,
    proposal_id: draft.frontmatter.id,
    status: nextStatus,
    target_artifact: draft.frontmatter.target_artifact,
  };
}

async function refreshProposalSetStatus(rootDir: string, proposalSetId: string): Promise<void> {
  const proposalSet = requireValidRecord(
    (await loadProposalSetRecords(rootDir)).find(
      (record) => record.frontmatter?.id === proposalSetId,
    ),
    `Unknown proposal set: ${proposalSetId}`,
  );
  const drafts = (await loadProposalDraftRecords(rootDir))
    .filter(
      (record) =>
        record.frontmatter?.proposal_set_id === proposalSetId &&
        record.errors.length === 0,
    )
    .map((record) => record.frontmatter!);
  const status = deriveProposalSetStatus(drafts.map((draft) => draft.status));

  await writeFrontmatterStatus(resolveRecordPath(rootDir, proposalSet.path), status);
}

async function writeProposalSet(
  rootDir: string,
  input: {
    id: string;
    sourceType: "intake" | "review";
    sourceRef: string;
    summary: string;
    sourceContext: string[];
    drafts: ProposalDraftInput[];
  },
): Promise<ProposalSetDetail> {
  const proposalDir = path.join(rootDir, "docs/proposals", input.id);
  await fs.mkdir(proposalDir, { recursive: true });

  const setContent = buildProposalSetMarkdown({
    id: input.id,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    summary: input.summary,
    sourceContext: input.sourceContext,
    drafts: input.drafts,
  });
  await fs.writeFile(path.join(proposalDir, "SET.md"), setContent, "utf8");

  for (const draft of input.drafts) {
    await fs.writeFile(
      path.join(proposalDir, draft.fileName),
      buildProposalDraftMarkdown(draft),
      "utf8",
    );
  }

  return getProposalSet(rootDir, input.id);
}

async function requireCleanRepository(rootDir: string) {
  const validation = await validateRepository(rootDir);
  const errors = collectValidationErrors(validation);

  if (errors.length > 0) {
    throw new Error(`repository validation failed:\n${errors.join("\n")}`);
  }

  return validation;
}

function buildDraftFrontmatter(input: {
  setId: string;
  sourceType: "intake" | "review";
  sourceRef: string;
  suffix: string;
  targetArtifact: string;
  targetKind: ProposalDraftFrontmatter["target_kind"];
}): ProposalDraftFrontmatter {
  return {
    id: `${input.setId}-${normalizeProposalSuffix(input.suffix)}`,
    proposal_set_id: input.setId,
    status: "draft",
    source_type: input.sourceType,
    source_ref: input.sourceRef,
    target_artifact: input.targetArtifact,
    target_kind: input.targetKind,
    generated_on: today(),
  };
}

function toProposalDraftDetail(
  record: ValidatedRecord<ProposalDraftFrontmatter>,
): ProposalDraftDetail {
  return {
    id: record.frontmatter!.id,
    relativePath: record.path,
    record: record.frontmatter!,
    summary: sectionContent(record.content, "Summary"),
    sourceContext: sectionContent(record.content, "Source Context"),
    proposedContent: extractMarkdownCodeFence(
      sectionContent(record.content, "Proposed Content"),
    ),
    content: record.content,
  };
}

function requireValidRecord<T>(
  record: ValidatedRecord<T> | undefined,
  notFoundMessage: string,
): ValidatedRecord<NonNullable<T>> & { frontmatter: NonNullable<T> } {
  if (!record) {
    throw new Error(notFoundMessage);
  }

  if (!record.frontmatter || record.errors.length > 0) {
    throw new Error(`${record.path} is invalid`);
  }

  return record as ValidatedRecord<NonNullable<T>> & { frontmatter: NonNullable<T> };
}

function resolveRecordPath(rootDir: string, relativePath: string): string {
  return path.resolve(rootDir, relativePath);
}

function toRootRelativePath(rootDir: string, relativeToCwdPath: string): string {
  return path.relative(rootDir, path.resolve(rootDir, relativeToCwdPath));
}

async function writeFrontmatterStatus(
  filePath: string,
  status: ProposalDraftFrontmatter["status"] | ProposalSetFrontmatter["status"],
): Promise<void> {
  const parsed = matter(await fs.readFile(filePath, "utf8"));
  const next = matter.stringify(parsed.content, {
    ...parsed.data,
    status,
  });
  await fs.writeFile(filePath, next, "utf8");
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function restoreTargetArtifact(filePath: string, content: string | null): Promise<void> {
  if (content === null) {
    await fs.rm(filePath, { force: true });
    return;
  }

  await fs.writeFile(filePath, content, "utf8");
}

function nextIdentifier(existingIds: string[], prefix: string): string {
  const nextNumber =
    Math.max(
      0,
      ...existingIds
        .map((value) => new RegExp(`^${prefix}-(\\d{3})`).exec(value)?.[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => Number.parseInt(value, 10)),
    ) + 1;

  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

function assignSequentialIds(existingIds: string[], prefix: string, count: number): string[] {
  const nextIds: string[] = [];
  let candidate = nextIdentifier(existingIds, prefix);

  for (let index = 0; index < count; index += 1) {
    nextIds.push(candidate);
    candidate = nextIdentifier([...existingIds, ...nextIds], prefix);
  }

  return nextIds;
}

function deriveAssumptions(
  summary: string,
  draftAssumptions: string[],
  questions: Array<{ id: string; type: string }>,
  answers: Record<string, string>,
): string[] {
  const assumptions = [...draftAssumptions];
  const questionTypes = new Map(questions.map((question) => [question.id, question.type]));

  for (const [questionId, answer] of Object.entries(answers)) {
    if (!answer.trim()) {
      continue;
    }

    if (isWorkflowQuestionType(questionTypes.get(questionId) ?? "")) {
      continue;
    }

    assumptions.push(`For ${summary}, ${questionId} was resolved as: ${answer.trim()}`);
  }

  return unique(assumptions);
}

function deriveGlossaryTerms(
  requestText: string,
  answers: Record<string, string>,
): Array<{ term: string; definition: string; notes: string }> {
  const termAnswer = Object.values(answers).find((answer) =>
    /term|glossary|rename|canonical/i.test(answer),
  ) ?? Object.values(answers)[0];

  if (!termAnswer?.trim()) {
    return [];
  }

  const term = extractCanonicalTerm(termAnswer);

  return [
    {
      term,
      definition: `Controlled term introduced or clarified for the request: ${requestText.trim() || "Unnamed request"}.`,
      notes: `Derived from operator answer: ${termAnswer.trim()}`,
    },
  ];
}

function deriveWorkflowContext(
  analysis: ReturnType<typeof analyzeRequest>,
  answers: Record<string, string>,
): WorkflowContext | null {
  const questionIds = Object.fromEntries(
    analysis.material_questions.map((question) => [question.type, question.id]),
  );
  const actorAnswer = answers[questionIds.workflow_actor]?.trim();
  const useCaseAnswer = answers[questionIds.workflow_use_case]?.trim();
  const goalAnswer = answers[questionIds.workflow_goal]?.trim();
  const constraintsAnswer = answers[questionIds.workflow_constraints]?.trim();

  if (!actorAnswer && !useCaseAnswer && !goalAnswer && !constraintsAnswer) {
    return null;
  }

  return {
    actor: actorAnswer,
    use_case: useCaseAnswer,
    actor_goal: goalAnswer,
    use_case_constraints: constraintsAnswer
      ? normalizeWorkflowConstraints(constraintsAnswer)
      : [],
  };
}

function deriveWorkflowGlossaryTerms(
  existingTerms: string[],
  workflowContext: WorkflowContext | null,
): Array<{ term: string; definition: string; notes: string }> {
  if (!workflowContext) {
    return [];
  }

  return [
    {
      term: "Actor",
      definition:
        "The external person or system role whose goal-driven interaction with the system-under-specification is being described or critiqued.",
      notes:
        "Use Actor for workflow critique and specification context, not for collaborators inside this single-operator platform.",
    },
    {
      term: "Use Case",
      definition:
        "A named goal-oriented interaction between an Actor and the system-under-specification that provides the durable unit for workflow critique.",
      notes:
        "Use Case is the canonical structured workflow concept for tranche records, packages, and review findings.",
    },
  ].filter((term) => !existingTerms.includes(term.term));
}

function deduplicateGlossaryTerms(
  terms: Array<{ term: string; definition: string; notes: string }>,
): Array<{ term: string; definition: string; notes: string }> {
  return terms.filter(
    (term, index) => terms.findIndex((candidate) => candidate.term === term.term) === index,
  );
}

function extractCanonicalTerm(answer: string): string {
  const fromBackticks = /`([^`]+)`/.exec(answer)?.[1];
  const fromArrow = /(?:->|=>)\s*([^,.;]+)/.exec(answer)?.[1];
  const fromQuoted =
    /"([^"]+)"/.exec(answer)?.[1] ?? /'([^']+)'/.exec(answer)?.[1];
  const raw = fromBackticks ?? fromArrow ?? fromQuoted ?? answer.split(/[.;]/)[0] ?? answer;

  return raw
    .trim()
    .replace(/^canonical replacement:?/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAnswerLines(answers: Record<string, string>): string[] {
  return Object.entries(answers)
    .filter(([, answer]) => answer.trim())
    .map(([questionId, answer]) => `- ${questionId}: ${answer.trim()}`);
}

function bulletLines(markdown: string, heading: string): string[] {
  const lines = extractBulletItems(markdown, heading);
  return lines.length > 0 ? lines : ["None."];
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function normalizeProposalSuffix(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "DRAFT";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
