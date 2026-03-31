import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import type { ZodType } from "zod";

import { createLogger, logOperation } from "../../runtime/logging.js";
import {
  baselineTemplates,
  decisionSections,
  executionTemplateSections,
  planTemplateSections,
  proposalDraftSections,
  proposalSetSections,
  reviewSections,
  requiredDirectories,
  requiredTopLevelFiles,
  trancheSections,
} from "./contracts.js";
import {
  extractBulletItems,
  findMissingSections,
  getSection,
  parseAssumptions,
  parseGlossary,
} from "./markdown.js";
import {
  decisionFrontmatterSchema,
  type DecisionFrontmatter,
  handoffFrontmatterSchema,
  type HandoffFrontmatter,
  promptTemplateSchema,
  type PromptTemplateFrontmatter,
  proposalDraftFrontmatterSchema,
  type ProposalDraftFrontmatter,
  proposalSetFrontmatterSchema,
  type ProposalSetFrontmatter,
  reviewFrontmatterSchema,
  type ReviewFrontmatter,
  trancheFrontmatterSchema,
  type TrancheFrontmatter,
} from "./schemas.js";
import { deriveProposalSetStatus } from "../proposals/status.js";
import {
  expectedWorkflowContextLines,
  linkedAssumptionsForTranche,
  linkedDecisionsForTranche,
  linkedGlossaryTermsForTranche,
  packageConstraints,
  packageValidationRequirements,
} from "../packaging/model.js";
import { buildTraceLinks, type TraceLink } from "../traceability/links.js";

const logger = createLogger("artifacts.repository");

export interface PresenceCheck {
  path: string;
  exists: boolean;
}

export interface ValidatedRecord<T> {
  path: string;
  frontmatter: T | null;
  content: string;
  errors: string[];
}

export interface RepositoryValidation {
  rootFiles: PresenceCheck[];
  directories: PresenceCheck[];
  decisions: Array<ValidatedRecord<DecisionFrontmatter>>;
  proposalSets: Array<ValidatedRecord<ProposalSetFrontmatter>>;
  proposalDrafts: Array<ValidatedRecord<ProposalDraftFrontmatter>>;
  tranches: Array<ValidatedRecord<TrancheFrontmatter>>;
  reviews: Array<ValidatedRecord<ReviewFrontmatter>>;
  planPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
  executionPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
  planTemplate: ValidatedRecord<PromptTemplateFrontmatter>;
  executionTemplate: ValidatedRecord<PromptTemplateFrontmatter>;
  assumptions: ReturnType<typeof parseAssumptions>;
  glossaryTerms: ReturnType<typeof parseGlossary>;
  openQuestions: string[];
  globalErrors: string[];
  traceLinks: TraceLink[];
}

export async function bootstrapRepository(
  rootDir: string,
  options?: { projectName?: string },
): Promise<string[]> {
  const projectName = options?.projectName?.trim() || "New Project";

  return logOperation(
    logger,
    "bootstrap repository",
    async () => {
      const created: string[] = [];

      for (const relativePath of requiredDirectories) {
        const absolutePath = path.join(rootDir, relativePath);

        try {
          await fs.access(absolutePath);
        } catch {
          await fs.mkdir(absolutePath, { recursive: true });
          created.push(relativePath);
        }
      }

      for (const template of baselineTemplates(projectName)) {
        const absolutePath = path.join(rootDir, template.path);

        try {
          await fs.access(absolutePath);
        } catch {
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, template.content, "utf8");
          created.push(template.path);
        }
      }

      return created;
    },
    {
      fields: {
        project_name: projectName,
        root_dir: rootDir,
      },
      summarizeResult: (created) => ({
        created_count: created.length,
        created_paths: created,
      }),
    },
  );
}

export async function validateRepository(rootDir: string): Promise<RepositoryValidation> {
  return logOperation(
    logger,
    "validate repository",
    async () => {
      const rootFiles = await Promise.all(
        requiredTopLevelFiles.map(async (relativePath) => ({
          path: relativePath,
          exists: await exists(path.join(rootDir, relativePath)),
        })),
      );

      const directories = await Promise.all(
        requiredDirectories.map(async (relativePath) => ({
          path: relativePath,
          exists: await exists(path.join(rootDir, relativePath)),
        })),
      );

      const decisions = await loadRecordDirectory(
        rootDir,
        path.join(rootDir, "docs/decisions"),
        decisionFrontmatterSchema,
        decisionSections,
      );

      const proposalSets = await loadProposalSetRecords(rootDir);
      const proposalDrafts = await loadProposalDraftRecords(rootDir);

      const tranches = await loadRecordDirectory(
        rootDir,
        path.join(rootDir, "docs/tranches"),
        trancheFrontmatterSchema,
        trancheSections,
      );

      const reviews = await loadRecordDirectory(
        rootDir,
        path.join(rootDir, "docs/reviews"),
        reviewFrontmatterSchema,
        reviewSections,
      );

      const planPackages = await loadHandoffDirectory(
        rootDir,
        path.join(rootDir, "handoffs/plan"),
        "plan",
        planTemplateSections,
      );

      const executionPackages = await loadHandoffDirectory(
        rootDir,
        path.join(rootDir, "handoffs/execution"),
        "execution",
        executionTemplateSections,
      );

      const planTemplate = await loadSingleRecord(
        rootDir,
        path.join(rootDir, "prompts/templates/plan-package.md"),
        promptTemplateSchema.refine((value) => value.template_type === "plan", {
          path: ["template_type"],
          message: "template_type must be plan",
        }),
        planTemplateSections,
      );

      const executionTemplate = await loadSingleRecord(
        rootDir,
        path.join(rootDir, "prompts/templates/execution-package.md"),
        promptTemplateSchema.refine((value) => value.template_type === "execution", {
          path: ["template_type"],
          message: "template_type must be execution",
        }),
        executionTemplateSections,
      );

      const assumptions = parseAssumptions(
        await readFileOrEmpty(path.join(rootDir, "ASSUMPTIONS.md")),
      );
      const glossaryTerms = parseGlossary(
        await readFileOrEmpty(path.join(rootDir, "GLOSSARY.md")),
      );
      const openQuestions = extractBulletItems(
        await readFileOrEmpty(path.join(rootDir, "PLAN.md")),
        "18. Open Questions That Genuinely Need Answering",
      );
      const globalErrors = [
        ...findDuplicateIds(
          "decision",
          decisions
            .map((record) => record.frontmatter?.id)
            .filter((value): value is string => Boolean(value)),
        ),
        ...findDuplicateIds(
          "tranche",
          tranches
            .map((record) => record.frontmatter?.id)
            .filter((value): value is string => Boolean(value)),
        ),
        ...findDuplicateIds(
          "review",
          reviews
            .map((record) => record.frontmatter?.id)
            .filter((value): value is string => Boolean(value)),
        ),
        ...findDuplicateIds(
          "proposal set",
          proposalSets
            .map((record) => record.frontmatter?.id)
            .filter((value): value is string => Boolean(value)),
        ),
        ...findDuplicateIds(
          "proposal draft",
          proposalDrafts
            .map((record) => record.frontmatter?.id)
            .filter((value): value is string => Boolean(value)),
        ),
        ...findProposalIntegrityErrors({
          proposalSets,
          proposalDrafts,
          reviews,
        }),
        ...findHandoffAlignmentErrors({
          tranches,
          decisions,
          planPackages,
          executionPackages,
          assumptions,
          glossaryTerms,
        }),
      ];
      const traceLinks = buildTraceLinks({
        decisions,
        proposalSets,
        proposalDrafts,
        tranches,
        reviews,
        planPackages,
        executionPackages,
      });

      return {
        rootFiles,
        directories,
        decisions,
        proposalSets,
        proposalDrafts,
        tranches,
        reviews,
        planPackages,
        executionPackages,
        planTemplate,
        executionTemplate,
        assumptions,
        glossaryTerms,
        openQuestions,
        globalErrors,
        traceLinks,
      };
    },
    {
      fields: {
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (validation) => {
        const errors = collectValidationErrors(validation);

        if (errors.length > 0) {
          logger.warn("repository validation found issues", {
            error_count: errors.length,
            errors,
            root_dir: rootDir,
          });
        }

        return {
          decision_count: validation.decisions.length,
          execution_package_count: validation.executionPackages.length,
          global_error_count: validation.globalErrors.length,
          glossary_term_count: validation.glossaryTerms.length,
          open_question_count: validation.openQuestions.length,
          plan_package_count: validation.planPackages.length,
          proposal_draft_count: validation.proposalDrafts.length,
          proposal_set_count: validation.proposalSets.length,
          review_count: validation.reviews.length,
          trace_link_count: validation.traceLinks.length,
          tranche_count: validation.tranches.length,
          validation_error_count: errors.length,
        };
      },
    },
  );
}

export async function loadTranche(
  rootDir: string,
  trancheId: string,
): Promise<ValidatedRecord<TrancheFrontmatter>> {
  const tranches = await loadRecordDirectory(
    rootDir,
    path.join(rootDir, "docs/tranches"),
    trancheFrontmatterSchema,
    trancheSections,
  );
  const tranche = tranches.find((record) => record.frontmatter?.id === trancheId);

  if (!tranche) {
    throw new Error(`Unknown tranche: ${trancheId}`);
  }

  if (tranche.errors.length > 0 || !tranche.frontmatter) {
    throw new Error(`Tranche ${trancheId} is invalid`);
  }

  return tranche;
}

export async function loadDecisions(rootDir: string) {
  return loadRecordDirectory(
    rootDir,
    path.join(rootDir, "docs/decisions"),
    decisionFrontmatterSchema,
    decisionSections,
  );
}

export async function loadHandoffPackage(rootDir: string, relativePath: string) {
  return loadSingleRecord(
    rootDir,
    path.join(rootDir, relativePath),
    handoffFrontmatterSchema,
    [],
  );
}

export async function loadReviewRecords(rootDir: string) {
  return loadRecordDirectory(
    rootDir,
    path.join(rootDir, "docs/reviews"),
    reviewFrontmatterSchema,
    reviewSections,
  );
}

export async function loadProposalSetRecords(rootDir: string) {
  const proposalsRoot = path.join(rootDir, "docs/proposals");

  if (!(await exists(proposalsRoot))) {
    return [];
  }

  const directoryNames = await loadProposalDirectories(proposalsRoot);

  return Promise.all(
    directoryNames.map((directoryName) =>
      loadSingleRecord(
        rootDir,
        path.join(proposalsRoot, directoryName, "SET.md"),
        proposalSetFrontmatterSchema,
        proposalSetSections,
      ).then((record) => {
        if (record.frontmatter && record.frontmatter.id !== directoryName) {
          record.errors.push(
            `proposal set id must match directory name: expected ${directoryName}`,
          );
        }

        return record;
      }),
    ),
  );
}

export async function loadProposalDraftRecords(rootDir: string) {
  const proposalsRoot = path.join(rootDir, "docs/proposals");

  if (!(await exists(proposalsRoot))) {
    return [];
  }

  const directoryNames = await loadProposalDirectories(proposalsRoot);
  const output: Array<ValidatedRecord<ProposalDraftFrontmatter>> = [];

  for (const directoryName of directoryNames) {
    const proposalDir = path.join(proposalsRoot, directoryName);
    const fileNames = (await fs.readdir(proposalDir))
      .filter((fileName) => fileName.endsWith(".md"))
      .filter((fileName) => fileName !== "SET.md")
      .sort();

    for (const fileName of fileNames) {
      const record = await loadSingleRecord(
        rootDir,
        path.join(proposalDir, fileName),
        proposalDraftFrontmatterSchema,
        proposalDraftSections,
      );

      if (record.frontmatter && record.frontmatter.proposal_set_id !== directoryName) {
        record.errors.push(
          `proposal_set_id must match directory name: expected ${directoryName}`,
        );
      }

      output.push(record);
    }
  }

  return output;
}

export function sectionContent(markdown: string, heading: string): string {
  return getSection(markdown, heading);
}

export async function readText(rootDir: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

export function collectValidationErrors(validation: RepositoryValidation): string[] {
  const errors: string[] = [...validation.globalErrors];

  for (const file of validation.rootFiles) {
    if (!file.exists) {
      errors.push(`missing file: ${file.path}`);
    }
  }

  for (const directory of validation.directories) {
    if (!directory.exists) {
      errors.push(`missing directory: ${directory.path}`);
    }
  }

  for (const record of [
    ...validation.decisions,
    ...validation.proposalSets,
    ...validation.proposalDrafts,
    ...validation.tranches,
    ...validation.reviews,
    ...validation.planPackages,
    ...validation.executionPackages,
    validation.planTemplate,
    validation.executionTemplate,
  ]) {
    for (const error of record.errors) {
      errors.push(`${record.path}: ${error}`);
    }
  }

  return errors;
}

async function loadRecordDirectory<T>(
  rootDir: string,
  directoryPath: string,
  schema: ZodType<T>,
  requiredSections: readonly string[],
): Promise<Array<ValidatedRecord<T>>> {
  if (!(await exists(directoryPath))) {
    return [];
  }

  const fileNames = (await fs.readdir(directoryPath))
    .filter((fileName) => fileName.endsWith(".md"))
    .filter((fileName) => fileName !== "TEMPLATE.md")
    .sort();

  return Promise.all(
    fileNames.map((fileName) =>
      loadSingleRecord(rootDir, path.join(directoryPath, fileName), schema, requiredSections),
    ),
  );
}

async function loadHandoffDirectory(
  rootDir: string,
  directoryPath: string,
  type: "plan" | "execution",
  requiredSections: readonly string[],
) {
  return loadRecordDirectory(
    rootDir,
    directoryPath,
    handoffFrontmatterSchema.refine((value) => value.type === type, {
      path: ["type"],
      message: `type must be ${type}`,
    }),
    requiredSections,
  );
}

async function loadSingleRecord<T>(
  rootDir: string,
  filePath: string,
  schema: ZodType<T>,
  requiredSections: readonly string[],
): Promise<ValidatedRecord<T>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const frontmatterResult = schema.safeParse(parsed.data);
    const errors = frontmatterResult.success
      ? []
      : frontmatterResult.error.issues.map((issue) => {
          const issuePath = issue.path.join(".");
          return issuePath ? `${issuePath}: ${issue.message}` : issue.message;
        });

    errors.push(
      ...findMissingSections(parsed.content, requiredSections).map(
        (section) => `missing section: ${section}`,
      ),
    );

    return {
      path: path.relative(rootDir, filePath),
      frontmatter: frontmatterResult.success ? frontmatterResult.data : null,
      content: parsed.content,
      errors,
    };
  } catch (error) {
    return {
      path: path.relative(rootDir, filePath),
      frontmatter: null,
      content: "",
      errors: [error instanceof Error ? error.message : "unknown error"],
    };
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function loadProposalDirectories(proposalsRoot: string): Promise<string[]> {
  return (await fs.readdir(proposalsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function findDuplicateIds(kind: string, ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  return [...duplicates].map((id) => `duplicate ${kind} id: ${id}`);
}

function findProposalIntegrityErrors(input: {
  proposalSets: Array<ValidatedRecord<ProposalSetFrontmatter>>;
  proposalDrafts: Array<ValidatedRecord<ProposalDraftFrontmatter>>;
  reviews: Array<ValidatedRecord<ReviewFrontmatter>>;
}): string[] {
  const errors: string[] = [];
  const validSets = input.proposalSets.filter(
    (record) => record.frontmatter && record.errors.length === 0,
  );
  const validDrafts = input.proposalDrafts.filter(
    (record) => record.frontmatter && record.errors.length === 0,
  );
  const validReviewIds = new Set(
    input.reviews
      .filter((record) => record.frontmatter && record.errors.length === 0)
      .map((record) => record.frontmatter!.id),
  );
  const proposalSetIndex = new Map(validSets.map((record) => [record.frontmatter!.id, record]));

  for (const proposalSet of validSets) {
    const childDrafts = validDrafts.filter(
      (draft) => draft.frontmatter!.proposal_set_id === proposalSet.frontmatter!.id,
    );
    const draftCount = childDrafts.length;

    if (draftCount === 0) {
      errors.push(`proposal set has no drafts: ${proposalSet.frontmatter!.id}`);
    }

    const expectedStatus = deriveProposalSetStatus(
      childDrafts.map((draft) => draft.frontmatter!.status),
    );

    if (proposalSet.frontmatter!.status !== expectedStatus) {
      errors.push(
        `proposal set status drift: ${proposalSet.frontmatter!.id} expected ${expectedStatus} but found ${proposalSet.frontmatter!.status}`,
      );
    }

    if (
      proposalSet.frontmatter!.source_type === "review" &&
      !validReviewIds.has(proposalSet.frontmatter!.source_ref)
    ) {
      errors.push(
        `proposal set ${proposalSet.frontmatter!.id} references missing review source ${proposalSet.frontmatter!.source_ref}`,
      );
    }
  }

  for (const draft of validDrafts) {
    const proposalSet = proposalSetIndex.get(draft.frontmatter!.proposal_set_id);

    if (!proposalSet) {
      errors.push(
        `proposal draft references missing proposal set: ${draft.frontmatter!.id} -> ${draft.frontmatter!.proposal_set_id}`,
      );
      continue;
    }

    if (
      draft.frontmatter!.source_type !== proposalSet.frontmatter!.source_type ||
      draft.frontmatter!.source_ref !== proposalSet.frontmatter!.source_ref
    ) {
      errors.push(
        `proposal draft ${draft.frontmatter!.id} source metadata does not match proposal set ${proposalSet.frontmatter!.id}`,
      );
    }
  }

  return errors;
}

function findHandoffAlignmentErrors(input: {
  tranches: Array<ValidatedRecord<TrancheFrontmatter>>;
  decisions: Array<ValidatedRecord<DecisionFrontmatter>>;
  planPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
  executionPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
  assumptions: ReturnType<typeof parseAssumptions>;
  glossaryTerms: ReturnType<typeof parseGlossary>;
}): string[] {
  const errors: string[] = [];
  const trancheIndex = new Map(
    input.tranches
      .filter((record) => record.frontmatter && record.errors.length === 0)
      .map((record) => [record.frontmatter!.id, record]),
  );
  const decisions = input.decisions
    .filter((record) => record.frontmatter && record.errors.length === 0)
    .map((record) => record.frontmatter!);

  for (const handoff of [...input.planPackages, ...input.executionPackages]) {
    if (!handoff.frontmatter || handoff.errors.length > 0) {
      continue;
    }

    const trancheRecord = trancheIndex.get(handoff.frontmatter.source_tranche);

    if (!trancheRecord) {
      errors.push(
        `handoff package references missing source tranche: ${handoff.frontmatter.id} -> ${handoff.frontmatter.source_tranche}`,
      );
      continue;
    }

    const acceptanceCriteria = extractBulletItems(
      trancheRecord.content,
      "Acceptance criteria",
    );
    const expectedRelatedDecisions = linkedDecisionsForTranche(
      trancheRecord.frontmatter!,
      decisions,
    ).map((decision) => decision.id);
    const expectedRelatedAssumptions = linkedAssumptionsForTranche(
      trancheRecord.frontmatter!,
      input.assumptions,
    ).map((assumption) => assumption.id);
    const expectedRelatedTerms = linkedGlossaryTermsForTranche(
      trancheRecord.frontmatter!,
      input.glossaryTerms,
    ).map((term) => term.term);
    const expectedWorkflowLines = expectedWorkflowContextLines(trancheRecord.frontmatter!).map(
      (line) => line.replace(/^- /, ""),
    );
    const actualWorkflowLines = extractBulletItems(handoff.content, "Workflow Context");

    errors.push(
      ...findArrayDriftErrors(handoff.frontmatter.id, [
        ["related_decisions", handoff.frontmatter.related_decisions, expectedRelatedDecisions],
        ["related_assumptions", handoff.frontmatter.related_assumptions, expectedRelatedAssumptions],
        ["related_terms", handoff.frontmatter.related_terms, expectedRelatedTerms],
        ["constraints", handoff.frontmatter.constraints, packageConstraints()],
        [
          "validation_requirements",
          handoff.frontmatter.validation_requirements,
          packageValidationRequirements(acceptanceCriteria),
        ],
      ]),
    );

    if (!sameStringArray(actualWorkflowLines, expectedWorkflowLines)) {
      errors.push(`handoff package workflow context drift: ${handoff.frontmatter.id}`);
    }
  }

  return errors;
}

function findArrayDriftErrors(
  handoffId: string,
  entries: Array<[string, string[], string[]]>,
): string[] {
  return entries
    .filter(([, actual, expected]) => !sameStringArray(actual, expected))
    .map(([field]) => `handoff package metadata drift: ${handoffId} ${field}`);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
