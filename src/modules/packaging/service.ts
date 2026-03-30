import fs from "node:fs/promises";
import path from "node:path";

import {
  defaultConstraints,
  defaultValidationChecks,
} from "../artifacts/contracts.js";
import {
  collectValidationErrors,
  loadDecisions,
  loadTranche,
  sectionContent,
  validateRepository,
} from "../artifacts/repository.js";
import { driftSignals, reviewTriggers } from "../governance/policy.js";
import { workflowContextLines } from "../governance/workflow.js";

export async function generatePackage(
  rootDir: string,
  type: "plan" | "execution",
  trancheId: string,
  persist = true,
) {
  const validation = await validateRepository(rootDir);
  const validationErrors = collectValidationErrors(validation);

  if (validationErrors.length > 0) {
    throw new Error(`repository validation failed:\n${validationErrors.join("\n")}`);
  }

  const trancheRecord = await loadTranche(rootDir, trancheId);
  const tranche = trancheRecord.frontmatter!;
  const decisions = (await loadDecisions(rootDir))
    .filter((record) => record.frontmatter && record.errors.length === 0)
    .map((record) => record.frontmatter!)
    .filter(
      (decision) =>
        tranche.related_decisions.includes(decision.id) ||
        decision.related_tranches.includes(tranche.id),
    );

  const assumptions = validation.assumptions.filter((assumption) =>
    tranche.related_assumptions.length === 0
      ? true
      : tranche.related_assumptions.includes(assumption.id),
  );
  const glossaryTerms = validation.glossaryTerms.filter((term) =>
    tranche.related_terms.length === 0 ? true : tranche.related_terms.includes(term.term),
  );
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
  };
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
    `constraints: ${formatInlineList([...defaultConstraints])}`,
    `validation_requirements: ${formatInlineList([
      ...defaultValidationChecks,
      ...input.acceptanceCriteria,
    ])}`,
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
    ...workflowContextLines(input.tranche ?? {}),
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
    ...defaultConstraints.map((constraint) => `- ${constraint}`),
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
    "# Validation Requirements",
    "",
    ...[...defaultValidationChecks, ...input.acceptanceCriteria].map(
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

function formatInlineList(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}
