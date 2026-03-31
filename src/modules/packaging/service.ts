import fs from "node:fs/promises";
import path from "node:path";

import { createLogger, logOperation } from "../../runtime/logging.js";
import {
  defaultExecutionConduct,
} from "../artifacts/contracts.js";
import { formatInlineList } from "../artifacts/markdown.js";
import {
  collectValidationErrors,
  loadDecisions,
  loadTranche,
  sectionContent,
  validateRepository,
} from "../artifacts/repository.js";
import { driftSignals, reviewTriggers } from "../governance/policy.js";
import {
  expectedWorkflowContextLines,
  linkedAssumptionsForTranche,
  linkedDecisionsForTranche,
  linkedGlossaryTermsForTranche,
  packageConstraints,
  packageValidationRequirements,
} from "./model.js";

const logger = createLogger("packaging");

export async function generatePackage(
  rootDir: string,
  type: "plan" | "execution",
  trancheId: string,
  persist = true,
) {
  return logOperation(
    logger,
    "generate package",
    async () => {
      const validation = await validateRepository(rootDir);
      const validationErrors = collectValidationErrors(validation);

      if (validationErrors.length > 0) {
        throw new Error(`repository validation failed:\n${validationErrors.join("\n")}`);
      }

      const trancheRecord = await loadTranche(rootDir, trancheId);
      const tranche = trancheRecord.frontmatter!;
      const decisions = linkedDecisionsForTranche(
        tranche,
        (await loadDecisions(rootDir))
          .filter((record) => record.frontmatter && record.errors.length === 0)
          .map((record) => record.frontmatter!),
      );
      const assumptions = linkedAssumptionsForTranche(tranche, validation.assumptions);
      const glossaryTerms = linkedGlossaryTermsForTranche(tranche, validation.glossaryTerms);
      const acceptanceCriteria = sectionToBulletList(
        sectionContent(trancheRecord.content, "Acceptance criteria"),
      );
      const scope = sectionContent(trancheRecord.content, "Scope");
      const outOfScope = sectionContent(trancheRecord.content, "Out of scope");
      const risks = sectionContent(trancheRecord.content, "Risks / tensions");

      const id = `${type.toUpperCase()}-${tranche.id}`;
      const relativePath = `handoffs/${type}/${tranche.id.toLowerCase()}-${type}.md`;
      const content = buildPackageMarkdown({
        id,
        type,
        tranche,
        decisions,
        assumptions,
        glossaryTerms,
        acceptanceCriteria,
        scope,
        outOfScope,
        risks,
        openQuestions: validation.openQuestions,
      });

      if (persist) {
        const absolutePath = path.join(rootDir, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content, "utf8");
      }

      return {
        id,
        relativePath,
        record: {
          id,
          type,
          source_tranche: tranche.id,
        },
        path: relativePath,
        content,
        diagnostics: {
          acceptance_criteria_count: acceptanceCriteria.length,
          assumption_count: assumptions.length,
          decision_count: decisions.length,
          glossary_term_count: glossaryTerms.length,
          open_question_count: validation.openQuestions.length,
        },
      };
    },
    {
      fields: {
        persist,
        root_dir: rootDir,
        tranche_id: trancheId,
        type,
      },
      summarizeResult: (result) => ({
        ...result.diagnostics,
        output_path: result.relativePath,
        package_id: result.id,
      }),
    },
  ).then(({ diagnostics: _diagnostics, ...result }) => result);
}

export async function refreshPackageSet(
  rootDir: string,
  trancheId: string,
  persist = true,
) {
  return logOperation(
    logger,
    "refresh package set",
    async () => {
      const packages = await Promise.all([
        generatePackage(rootDir, "plan", trancheId, persist),
        generatePackage(rootDir, "execution", trancheId, persist),
      ]);

      return {
        tranche_id: trancheId,
        packages,
      };
    },
    {
      fields: {
        persist,
        root_dir: rootDir,
        tranche_id: trancheId,
      },
      summarizeResult: (result) => ({
        package_count: result.packages.length,
        package_ids: result.packages.map((entry) => entry.id),
      }),
    },
  );
}

function buildPackageMarkdown(input: {
  id: string;
  type: "plan" | "execution";
  tranche: Awaited<ReturnType<typeof loadTranche>>["frontmatter"];
  decisions: Array<NonNullable<Awaited<ReturnType<typeof loadDecisions>>[number]["frontmatter"]>>;
  assumptions: Array<{ id: string; text: string }>;
  glossaryTerms: Array<{ term: string; definition: string; notes: string }>;
  acceptanceCriteria: string[];
  scope: string;
  outOfScope: string;
  risks: string;
  openQuestions: string[];
}): string {
  const frontmatter = [
    "---",
    `id: ${input.id}`,
    `type: ${input.type}`,
    "status: approved",
    `source_tranche: ${input.tranche!.id}`,
    `related_decisions: ${formatInlineList(input.decisions.map((decision) => decision.id))}`,
    `related_assumptions: ${formatInlineList(input.assumptions.map((assumption) => assumption.id))}`,
    `related_terms: ${formatInlineList(input.glossaryTerms.map((term) => term.term))}`,
    `constraints: ${formatInlineList(packageConstraints())}`,
    `validation_requirements: ${formatInlineList(
      packageValidationRequirements(input.acceptanceCriteria),
    )}`,
    "---",
    "",
  ];

  const sharedSections = [
    "# Objective",
    "",
    input.tranche!.goal,
    "",
    "# Scope",
    "",
    input.scope,
    "",
    "# Workflow Context",
    "",
    ...expectedWorkflowContextLines(input.tranche!),
    "",
    "# Relevant Artefacts",
    "",
    ...[
      "PROJECT_AIMS.md",
      "PLAN.md",
      "ARCHITECTURE.md",
      "GLOSSARY.md",
      "DATA_DICTIONARY.md",
      "ASSUMPTIONS.md",
      "RISKS.md",
      ...input.tranche!.affected_artifacts,
    ]
      .filter((value, index, values) => values.indexOf(value) === index)
      .map((artefact) => `- ${artefact}`),
    "",
    "# Locked Decisions",
    "",
    ...(input.decisions.length > 0
      ? input.decisions.map(
          (decision) => `- ${decision.id}: ${decision.title} (${decision.status})`,
        )
      : ["- No linked decisions."]),
    "",
    "# Active Assumptions",
    "",
    ...(input.assumptions.length > 0
      ? input.assumptions.map(
          (assumption) => `- ${assumption.id}: ${assumption.text}`,
        )
      : ["- No linked assumptions."]),
    "",
    "# Constraints",
    "",
    ...packageConstraints().map((constraint) => `- ${constraint}`),
    "",
  ];

  const planSections = [
    "# Deferred Questions",
    "",
    ...input.openQuestions.map((question) => `- ${question}`),
    "",
    "# Expected Output",
    "",
    "- Produce a repository-oriented implementation plan.",
    "- Keep scope, risks, and validation explicit.",
    "",
    "# Planning Success Criteria",
    "",
    ...input.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
  ];

  const executionSections = [
    "# Execution Conduct",
    "",
    ...defaultExecutionConduct.map((item) => `- ${item}`),
    "",
    "# Validation Requirements",
    "",
    ...packageValidationRequirements(input.acceptanceCriteria).map(
      (requirement) => `- ${requirement}`,
    ),
    "",
    "# Review Triggers",
    "",
    ...reviewTriggers.map((trigger) => `- ${trigger}`),
    `- Monitor drift signals: ${driftSignals.join(", ")}.`,
    "",
    "# Definition Of Done",
    "",
    ...input.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
  ];

  const footer = [
    "# Out Of Scope",
    "",
    input.outOfScope,
    "",
    "# Risks / Tensions",
    "",
    input.risks,
    "",
    "# Related Terms",
    "",
    ...input.glossaryTerms.map(
      (term) => `- ${term.term}: ${term.definition}`,
    ),
    "",
  ];

  return [
    ...frontmatter,
    ...sharedSections,
    ...(input.type === "plan" ? planSections : executionSections),
    ...footer,
  ].join("\n");
}

function sectionToBulletList(sectionContent: string): string[] {
  return sectionContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}
