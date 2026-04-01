import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { createLogger, logOperation } from "../../runtime/logging.js";
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
import { IntakeError } from "../intake/errors.js";
import {
  buildDecisionRecord,
  buildGlossaryProposal,
  buildProposalDraftMarkdown,
  buildProposalSetMarkdown,
  buildTrancheRecord,
  slugify,
  type ProposalDraftInput,
} from "./builders.js";
import { deriveProposalSetStatus } from "./status.js";

const logger = createLogger("proposals");

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
  return logOperation(
    logger,
    "list proposal sets",
    async () => {
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
    },
    {
      fields: {
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (proposalSets) => ({
        proposal_set_count: proposalSets.length,
      }),
    },
  );
}

export async function getProposalSet(
  rootDir: string,
  proposalSetId: string,
): Promise<ProposalSetDetail> {
  return logOperation(
    logger,
    "get proposal set",
    async () => {
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
    },
    {
      fields: {
        proposal_set_id: proposalSetId,
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (proposalSet) => ({
        draft_count: proposalSet.drafts.length,
        status: proposalSet.record.status,
      }),
    },
  );
}

export async function generateReviewProposalSet(
  rootDir: string,
  trancheId: string,
): Promise<ProposalSetDetail> {
  return logOperation(
    logger,
    "generate review proposal set",
    async () => {
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
    },
    {
      fields: {
        root_dir: rootDir,
        tranche_id: trancheId,
      },
      summarizeResult: (proposalSet) => ({
        draft_count: proposalSet.drafts.length,
        proposal_set_id: proposalSet.id,
        source_type: proposalSet.record.source_type,
        target_artifacts: proposalSet.drafts.map((draft) => draft.record.target_artifact),
      }),
    },
  );
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
  return logOperation(
    logger,
    `${nextStatus === "approved" ? "approve" : "reject"} proposal draft`,
    async () => {
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
          logger.warn("proposal approval rollback triggered", {
            proposal_id: proposalId,
            proposal_set_id: draft.frontmatter.proposal_set_id,
            root_dir: rootDir,
            target_artifact: draft.frontmatter.target_artifact,
          });
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
    },
    {
      fields: {
        proposal_id: proposalId,
        root_dir: rootDir,
        status: nextStatus,
      },
      summarizeResult: (result) => ({
        proposal_set_id: result.proposal_set_id,
        target_artifact: result.target_artifact,
      }),
    },
  );
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
  logger.debug("refreshed proposal set status", {
    proposal_set_id: proposalSetId,
    root_dir: rootDir,
    status,
  });
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

  logger.debug("wrote proposal set files", {
    draft_count: input.drafts.length,
    proposal_directory: proposalDir,
    proposal_set_id: input.id,
    root_dir: rootDir,
  });

  return getProposalSet(rootDir, input.id);
}

async function requireCleanRepository(rootDir: string) {
  const validation = await validateRepository(rootDir);
  const errors = collectValidationErrors(validation);

  if (errors.length > 0) {
    throw new Error(`repository validation failed:\n${errors.join("\n")}`);
  }

  logger.debug("repository is clean for proposal workflow", {
    root_dir: rootDir,
  });

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
