import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { bootstrapRepository } from "../../src/modules/artifacts/repository.js";

export interface FixtureRepo {
  rootDir: string;
  cleanup(): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  read(relativePath: string): Promise<string>;
  remove(relativePath: string): Promise<void>;
  write(relativePath: string, content: string): Promise<void>;
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface SeedRepositoryOptions {
  assumptions?: Array<{ id: string; text: string }>;
  decisions?: RepoFile[];
  executionPackages?: RepoFile[];
  glossaryTerms?: Array<{ term: string; definition: string; notes?: string }>;
  planContent?: string;
  planPackages?: RepoFile[];
  proposals?: RepoFile[];
  reviews?: RepoFile[];
  tranches?: RepoFile[];
}

export async function createFixtureRepo(options?: {
  planContent?: string;
  projectAimsContent?: string;
}): Promise<FixtureRepo> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "idea-to-codex-"));

  const repo: FixtureRepo = {
    rootDir,
    async cleanup() {
      await fs.rm(rootDir, { recursive: true, force: true });
    },
    async exists(relativePath: string) {
      try {
        await fs.access(path.join(rootDir, relativePath));
        return true;
      } catch {
        return false;
      }
    },
    async read(relativePath: string) {
      return fs.readFile(path.join(rootDir, relativePath), "utf8");
    },
    async remove(relativePath: string) {
      await fs.rm(path.join(rootDir, relativePath), { recursive: true, force: true });
    },
    async write(relativePath: string, content: string) {
      const absolutePath = path.join(rootDir, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");
    },
  };

  await repo.write(
    "PROJECT_AIMS.md",
    options?.projectAimsContent ?? "# PROJECT AIMS\n\nFixture project aims.\n",
  );
  await repo.write(
    "PLAN.md",
    options?.planContent ?? buildPlanMd(["None."]),
  );

  return repo;
}

export async function seedValidRepository(
  repo: FixtureRepo,
  options?: SeedRepositoryOptions,
): Promise<void> {
  await bootstrapRepository(repo.rootDir);

  await repo.write(
    "PLAN.md",
    options?.planContent ?? buildPlanMd(["None."]),
  );
  await repo.write(
    "ASSUMPTIONS.md",
    buildAssumptionsMd(
      options?.assumptions ?? [
        { id: "A-001", text: "Fixture assumption one." },
        { id: "A-002", text: "Fixture assumption two." },
      ],
    ),
  );
  await repo.write(
    "GLOSSARY.md",
    buildGlossaryMd(
      options?.glossaryTerms ?? [
        {
          term: "Artefact",
          definition: "A versioned repository item that carries project truth.",
          notes: "Fixture glossary term.",
        },
        {
          term: "Tranche",
          definition: "A bounded unit of work approved for planning, execution, and review.",
          notes: "Fixture glossary term.",
        },
      ],
    ),
  );

  for (const file of options?.decisions ?? [defaultDecisionFile()]) {
    await repo.write(file.path, file.content);
  }

  for (const file of options?.tranches ?? [defaultTrancheFile()]) {
    await repo.write(file.path, file.content);
  }

  for (const file of options?.reviews ?? []) {
    await repo.write(file.path, file.content);
  }

  for (const file of options?.planPackages ?? []) {
    await repo.write(file.path, file.content);
  }

  for (const file of options?.executionPackages ?? []) {
    await repo.write(file.path, file.content);
  }

  for (const file of options?.proposals ?? []) {
    await repo.write(file.path, file.content);
  }
}

export function buildPlanMd(openQuestions?: string[]): string {
  const questionLines =
    openQuestions === undefined
      ? ["- None."]
      : openQuestions.map((question) => `- ${question}`);

  return [
    "# PLAN",
    "",
    "## 18. Open Questions That Genuinely Need Answering",
    "",
    ...questionLines,
    "",
  ].join("\n");
}

export function buildAssumptionsMd(assumptions: Array<{ id: string; text: string }>): string {
  return [
    "# Assumptions",
    "",
    "## Active assumptions",
    "",
    ...assumptions.map((assumption) => `- \`${assumption.id}\`: ${assumption.text}`),
    "",
  ].join("\n");
}

export function buildGlossaryMd(
  terms: Array<{ term: string; definition: string; notes?: string }>,
): string {
  return [
    "# Glossary",
    "",
    ...terms.flatMap((term) => [
      `## ${term.term}`,
      "",
      `- Canonical name: \`${term.term}\``,
      "- Allowed aliases: `fixture`",
      `- Definition: ${term.definition}`,
      "- Disallowed or deprecated synonyms: `legacy fixture`",
      "- Related entities: `Tranche`",
      `- Notes / usage constraints: ${term.notes ?? ""}`,
      "",
    ]),
  ].join("\n");
}

export function defaultDecisionFile(): RepoFile {
  return {
    path: "docs/decisions/DEC-001-test.md",
    content: buildDecisionRecord(),
  };
}

export function defaultTrancheFile(): RepoFile {
  return {
    path: "docs/tranches/TRANCHE-001-test.md",
    content: buildTrancheRecord(),
  };
}

export function buildDecisionRecord(input?: {
  affectedArtifacts?: string[];
  date?: string;
  id?: string;
  omitSections?: string[];
  owners?: string[];
  relatedTranches?: string[];
  status?: string;
  supersedes?: string[];
  tags?: string[];
  title?: string;
}): string {
  const sections = [
    section("Context", "Fixture context."),
    section("Decision", "Fixture decision."),
    section("Options considered", "- Keep the fixture simple."),
    section("Consequences", "- Validation should pass."),
    section("Follow-up actions", "- None."),
  ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? "DEC-001"}`,
      `title: ${input?.title ?? "Fixture decision"}`,
      `status: ${input?.status ?? "locked"}`,
      `date: ${input?.date ?? "2026-03-18"}`,
      ...yamlList("owners", input?.owners ?? ["test-owner"]),
      ...yamlList("related_tranches", input?.relatedTranches ?? ["TRANCHE-001"]),
      ...yamlList("affected_artifacts", input?.affectedArtifacts ?? ["PLAN.md"]),
      ...yamlList("supersedes", input?.supersedes ?? []),
      ...yamlList("tags", input?.tags ?? ["test"]),
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

export function buildTrancheRecord(input?: {
  acceptanceStatus?: string;
  affectedArtifacts?: string[];
  affectedModules?: string[];
  dependsOn?: string[];
  goal?: string;
  id?: string;
  omitSections?: string[];
  priority?: string;
  relatedAssumptions?: string[];
  relatedDecisions?: string[];
  relatedTerms?: string[];
  reviewTrigger?: string;
  status?: string;
  title?: string;
}): string {
  const sections = [
    section("Scope", "- Validate the repository contract."),
    section("Out of scope", "- UI work."),
    section("Preconditions", "- Fixture documents exist."),
    section("Acceptance criteria", "- Generate a package."),
    section("Risks / tensions", "- Minimal fixture coverage."),
    section("Notes", "- None."),
  ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? "TRANCHE-001"}`,
      `title: ${input?.title ?? "Fixture tranche"}`,
      `status: ${input?.status ?? "approved"}`,
      `priority: ${input?.priority ?? "high"}`,
      `goal: ${input?.goal ?? "Validate the backend."}`,
      ...yamlList("depends_on", input?.dependsOn ?? []),
      ...yamlList("affected_artifacts", input?.affectedArtifacts ?? ["PLAN.md", "ARCHITECTURE.md"]),
      ...yamlList("affected_modules", input?.affectedModules ?? ["artifacts", "packaging"]),
      ...yamlList("related_decisions", input?.relatedDecisions ?? ["DEC-001"]),
      ...yamlList("related_assumptions", input?.relatedAssumptions ?? []),
      ...yamlList("related_terms", input?.relatedTerms ?? ["Artefact", "Tranche"]),
      `review_trigger: ${input?.reviewTrigger ?? "tranche_complete"}`,
      `acceptance_status: ${input?.acceptanceStatus ?? "in_progress"}`,
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

export function buildReviewRecord(input?: {
  driftSignals?: string[];
  generatedOn?: string;
  id?: string;
  omitSections?: string[];
  relatedDecisions?: string[];
  relatedPackages?: string[];
  reviewReason?: string;
  sourceTranche?: string;
  status?: string;
}): string {
  const sections = [
    section("Summary", "Fixture summary."),
    section("Trigger", "- Triggered by fixture."),
    section("Package Coverage", "- No persisted packages."),
    section("Drift Signals", "- No configured drift signals detected."),
    section("Findings", "- No durable drift findings detected."),
    section("Recommended Actions", "- Keep the current fixture state as-is."),
    section("Durable Changes", "- No durable repository change required."),
  ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? "REVIEW-TRANCHE-001"}`,
      `source_tranche: ${input?.sourceTranche ?? "TRANCHE-001"}`,
      `status: ${input?.status ?? "recorded"}`,
      `review_reason: ${input?.reviewReason ?? "tranche_complete"}`,
      `generated_on: ${input?.generatedOn ?? "2026-03-18"}`,
      ...yamlList("related_decisions", input?.relatedDecisions ?? ["DEC-001"]),
      ...yamlList("related_packages", input?.relatedPackages ?? []),
      ...yamlList("drift_signals", input?.driftSignals ?? []),
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

export function buildHandoffRecord(input?: {
  constraints?: string[];
  id?: string;
  omitSections?: string[];
  relatedAssumptions?: string[];
  relatedDecisions?: string[];
  relatedTerms?: string[];
  sourceTranche?: string;
  status?: string;
  type?: string;
  validationRequirements?: string[];
}): string {
  const type = input?.type ?? "plan";
  const sections =
    type === "execution"
      ? [
          section("Objective", "Fixture execution objective."),
          section("Scope", "- Implement the fixture."),
          section("Relevant Artefacts", "- PLAN.md"),
          section("Locked Decisions", "- DEC-001"),
          section("Active Assumptions", "- A-001"),
          section("Constraints", "- Keep it small."),
          section("Validation Requirements", "- Run fixture validation."),
          section("Review Triggers", "- Review at tranche end."),
          section("Definition Of Done", "- Execution done."),
        ]
      : [
          section("Objective", "Fixture planning objective."),
          section("Scope", "- Plan the fixture."),
          section("Relevant Artefacts", "- PLAN.md"),
          section("Locked Decisions", "- DEC-001"),
          section("Active Assumptions", "- A-001"),
          section("Constraints", "- Keep it small."),
          section("Deferred Questions", "- None."),
          section("Expected Output", "- Produce a plan."),
          section("Planning Success Criteria", "- Planning done."),
        ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? `${type.toUpperCase()}-TRANCHE-001`}`,
      `type: ${type}`,
      `status: ${input?.status ?? "approved"}`,
      `source_tranche: ${input?.sourceTranche ?? "TRANCHE-001"}`,
      ...yamlList("related_decisions", input?.relatedDecisions ?? ["DEC-001"]),
      ...yamlList("related_assumptions", input?.relatedAssumptions ?? ["A-001"]),
      ...yamlList("related_terms", input?.relatedTerms ?? ["Artefact"]),
      ...yamlList("constraints", input?.constraints ?? ["Repository artefacts are the source of truth."]),
      ...yamlList(
        "validation_requirements",
        input?.validationRequirements ?? ["Run repository validation."],
      ),
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

export function buildProposalSetRecord(input?: {
  generatedOn?: string;
  id?: string;
  omitSections?: string[];
  sourceRef?: string;
  sourceType?: string;
  status?: string;
  summary?: string;
}): string {
  const sections = [
    section("Summary", input?.summary ?? "Fixture proposal set summary."),
    section("Source Context", "- Fixture proposal source."),
    section("Drafts", "- PROPOSAL-001-BACKLOG: BACKLOG.md"),
  ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? "PROPOSAL-001"}`,
      `status: ${input?.status ?? "draft"}`,
      `source_type: ${input?.sourceType ?? "intake"}`,
      `source_ref: ${input?.sourceRef ?? "INTAKE-PROPOSAL-001"}`,
      `generated_on: ${input?.generatedOn ?? "2026-03-18"}`,
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

export function buildProposalDraftRecord(input?: {
  generatedOn?: string;
  id?: string;
  omitSections?: string[];
  proposalSetId?: string;
  sourceRef?: string;
  sourceType?: string;
  status?: string;
  summary?: string;
  targetArtifact?: string;
  targetKind?: string;
  proposedContent?: string;
}): string {
  const sections = [
    section("Summary", input?.summary ?? "Fixture proposal draft summary."),
    section("Source Context", "- Fixture proposal source."),
    section(
      "Proposed Content",
      [
        "```md",
        input?.proposedContent ?? "# Fixture\n\nProposed replacement content.\n",
        "```",
      ].join("\n"),
    ),
  ];

  return buildRecord({
    frontmatter: [
      `id: ${input?.id ?? "PROPOSAL-001-BACKLOG"}`,
      `proposal_set_id: ${input?.proposalSetId ?? "PROPOSAL-001"}`,
      `status: ${input?.status ?? "draft"}`,
      `source_type: ${input?.sourceType ?? "intake"}`,
      `source_ref: ${input?.sourceRef ?? "INTAKE-PROPOSAL-001"}`,
      `target_artifact: ${input?.targetArtifact ?? "BACKLOG.md"}`,
      `target_kind: ${input?.targetKind ?? "top_level"}`,
      `generated_on: ${input?.generatedOn ?? "2026-03-18"}`,
    ],
    omitSections: input?.omitSections ?? [],
    sections,
  });
}

function buildRecord(input: {
  frontmatter: string[];
  omitSections: string[];
  sections: Array<{ heading: string; body: string }>;
}): string {
  return [
    "---",
    ...input.frontmatter,
    "---",
    "",
    ...input.sections
      .filter((entry) => !input.omitSections.includes(entry.heading))
      .flatMap((entry) => [`# ${entry.heading}`, "", entry.body, ""]),
  ].join("\n");
}

function section(heading: string, body: string) {
  return { heading, body };
}

function yamlList(name: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${name}: []`];
  }

  return [ `${name}:`, ...values.map((value) => `  - ${value}`) ];
}
