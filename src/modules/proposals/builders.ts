import { sectionContent } from "../artifacts/repository.js";
import type {
  DecisionFrontmatter,
  ProposalDraftFrontmatter,
  TrancheFrontmatter,
} from "../artifacts/schemas.js";

export interface ProposalDraftInput {
  fileName: string;
  frontmatter: ProposalDraftFrontmatter;
  summary: string;
  sourceContext: string[];
  proposedContent: string;
}

export function buildProposalSetMarkdown(input: {
  id: string;
  sourceType: "intake" | "review";
  sourceRef: string;
  summary: string;
  sourceContext: string[];
  drafts: ProposalDraftInput[];
}): string {
  return [
    "---",
    `id: ${input.id}`,
    "status: draft",
    `source_type: ${input.sourceType}`,
    `source_ref: ${input.sourceRef}`,
    `generated_on: ${today()}`,
    "---",
    "",
    "# Summary",
    "",
    input.summary,
    "",
    "# Source Context",
    "",
    ...input.sourceContext,
    "",
    "# Drafts",
    "",
    ...input.drafts.map(
      (draft) => `- ${draft.frontmatter.id}: ${draft.frontmatter.target_artifact}`,
    ),
    "",
  ].join("\n");
}

export function buildProposalDraftMarkdown(input: ProposalDraftInput): string {
  return [
    "---",
    `id: ${input.frontmatter.id}`,
    `proposal_set_id: ${input.frontmatter.proposal_set_id}`,
    `status: ${input.frontmatter.status}`,
    `source_type: ${input.frontmatter.source_type}`,
    `source_ref: ${input.frontmatter.source_ref}`,
    `target_artifact: ${input.frontmatter.target_artifact}`,
    `target_kind: ${input.frontmatter.target_kind}`,
    `generated_on: ${input.frontmatter.generated_on}`,
    "---",
    "",
    "# Summary",
    "",
    input.summary,
    "",
    "# Source Context",
    "",
    ...input.sourceContext,
    "",
    "# Proposed Content",
    "",
    "```md",
    input.proposedContent.trim(),
    "```",
    "",
  ].join("\n");
}

export function buildBacklogProposal(markdown: string, trancheId: string, title: string): string {
  return upsertBulletSectionLine(
    markdown,
    "Next candidate tranches",
    `- \`${trancheId}\`: ${title}.`,
    (line) => line.includes(`\`${trancheId}\``),
  );
}

export function buildAssumptionsProposal(
  markdown: string,
  assumptions: Array<{ id: string; text: string }>,
): string {
  let nextMarkdown = markdown;

  for (const assumption of assumptions) {
    nextMarkdown = upsertBulletSectionLine(
      nextMarkdown,
      "Active assumptions",
      `- \`${assumption.id}\`: ${assumption.text}`,
      (line) => line.includes(`\`${assumption.id}\``),
    );
  }

  return nextMarkdown;
}

export function buildGlossaryProposal(
  markdown: string,
  terms: Array<{ term: string; definition: string; notes: string }>,
): string {
  let nextMarkdown = markdown.trimEnd();

  for (const term of terms) {
    const sectionMarkdown = [
      `## ${term.term}`,
      "",
      `- Canonical name: \`${term.term}\``,
      "- Allowed aliases: `proposal`",
      `- Definition: ${term.definition}`,
      "- Disallowed or deprecated synonyms: `undefined term`",
      "- Related entities: `Glossary Term`, `Tranche`",
      `- Notes / usage constraints: ${term.notes}`,
      "",
    ].join("\n");

    nextMarkdown = replaceSection(nextMarkdown, term.term, sectionMarkdown, 2);
  }

  return `${nextMarkdown.trimEnd()}\n`;
}

export function buildDecisionRecord(input: {
  id: string;
  title: string;
  status: DecisionFrontmatter["status"];
  date: string;
  owners: string[];
  relatedTranches: string[];
  affectedArtifacts: string[];
  supersedes: string[];
  tags: string[];
  context: string[];
  decision: string[];
  options: string[];
  consequences: string[];
  followUp: string[];
}): string {
  return [
    "---",
    `id: ${input.id}`,
    `title: ${input.title}`,
    `status: ${input.status}`,
    `date: ${input.date}`,
    ...yamlList("owners", input.owners),
    ...yamlList("related_tranches", input.relatedTranches),
    ...yamlList("affected_artifacts", input.affectedArtifacts),
    ...yamlList("supersedes", input.supersedes),
    ...yamlList("tags", input.tags),
    "---",
    "",
    "# Context",
    "",
    ...input.context,
    "",
    "# Decision",
    "",
    ...input.decision,
    "",
    "# Options considered",
    "",
    ...input.options.map((item) => `- ${item}`),
    "",
    "# Consequences",
    "",
    ...input.consequences.map((item) => `- ${item}`),
    "",
    "# Follow-up actions",
    "",
    ...input.followUp.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

export function buildTrancheRecord(input: {
  id: string;
  title: string;
  status: TrancheFrontmatter["status"];
  priority: TrancheFrontmatter["priority"];
  goal: string;
  affectedArtifacts: string[];
  affectedModules: string[];
  relatedDecisions: string[];
  relatedAssumptions: string[];
  relatedTerms: string[];
  reviewTrigger: string;
  acceptanceStatus: TrancheFrontmatter["acceptance_status"];
  scope: string[];
  outOfScope: string[];
  preconditions: string[];
  acceptanceCriteria: string[];
  risks: string[];
  notes: string[];
}): string {
  return [
    "---",
    `id: ${input.id}`,
    `title: ${input.title}`,
    `status: ${input.status}`,
    `priority: ${input.priority}`,
    `goal: ${input.goal}`,
    "depends_on: []",
    ...yamlList("affected_artifacts", input.affectedArtifacts),
    ...yamlList("affected_modules", input.affectedModules),
    ...yamlList("related_decisions", input.relatedDecisions),
    ...yamlList("related_assumptions", input.relatedAssumptions),
    ...yamlList("related_terms", input.relatedTerms),
    `review_trigger: ${input.reviewTrigger}`,
    `acceptance_status: ${input.acceptanceStatus}`,
    "---",
    "",
    "# Scope",
    "",
    ...input.scope.map((item) => `- ${item}`),
    "",
    "# Out of scope",
    "",
    ...input.outOfScope.map((item) => `- ${item}`),
    "",
    "# Preconditions",
    "",
    ...input.preconditions.map((item) => `- ${item}`),
    "",
    "# Acceptance criteria",
    "",
    ...input.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "# Risks / tensions",
    "",
    ...input.risks.map((item) => `- ${item}`),
    "",
    "# Notes",
    "",
    ...input.notes.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "proposal";
}

function replaceSection(
  markdown: string,
  heading: string,
  replacement: string,
  level?: number,
): string {
  const lines = markdown.trimEnd().split("\n");
  const output: string[] = [];
  let index = 0;
  let replaced = false;

  while (index < lines.length) {
    const line = lines[index];
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());

    if (
      match &&
      match[2].trim() === heading &&
      (level === undefined || match[1].length === level)
    ) {
      output.push(...replacement.trim().split("\n"));
      replaced = true;
      index += 1;

      while (index < lines.length) {
        const nextMatch = /^(#{1,6})\s+(.+)$/.exec(lines[index].trim());

        if (nextMatch && (level === undefined || nextMatch[1].length <= level)) {
          break;
        }

        index += 1;
      }

      continue;
    }

    output.push(line);
    index += 1;
  }

  if (!replaced) {
    output.push("", ...replacement.trim().split("\n"));
  }

  return `${output.join("\n").trimEnd()}\n`;
}

function upsertBulletSectionLine(
  markdown: string,
  heading: string,
  nextLine: string,
  matcher: (line: string) => boolean,
): string {
  const existingLines = sectionContent(markdown, heading)
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => Boolean(line));
  const filtered = existingLines.filter((line) => !matcher(line) && line !== "- None.");
  const updatedLines = [...filtered, nextLine].sort((left, right) => left.localeCompare(right));

  return replaceSection(
    markdown,
    heading,
    [`## ${heading}`, "", ...(updatedLines.length > 0 ? updatedLines : ["- None."]), ""].join("\n"),
    2,
  );
}

function yamlList(name: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${name}: []`];
  }

  return [ `${name}:`, ...values.map((value) => `  - ${value}`) ];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
