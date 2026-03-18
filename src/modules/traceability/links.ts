import type {
  DecisionFrontmatter,
  HandoffFrontmatter,
  ProposalDraftFrontmatter,
  ProposalSetFrontmatter,
  ReviewFrontmatter,
  TrancheFrontmatter,
} from "../artifacts/schemas.js";
import type { ValidatedRecord } from "../artifacts/repository.js";

export interface TraceLink {
  fromType: "decision" | "intake" | "proposal" | "review" | "tranche";
  fromId: string;
  toType: "artifact" | "decision" | "package" | "proposal" | "review" | "tranche";
  toId: string;
  reason: string;
}

export function buildTraceLinks(input: {
  decisions: Array<ValidatedRecord<DecisionFrontmatter>>;
  proposalSets: Array<ValidatedRecord<ProposalSetFrontmatter>>;
  proposalDrafts: Array<ValidatedRecord<ProposalDraftFrontmatter>>;
  tranches: Array<ValidatedRecord<TrancheFrontmatter>>;
  reviews: Array<ValidatedRecord<ReviewFrontmatter>>;
  planPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
  executionPackages: Array<ValidatedRecord<HandoffFrontmatter>>;
}): TraceLink[] {
  const links: TraceLink[] = [];

  for (const decision of input.decisions) {
    if (!decision.frontmatter || decision.errors.length > 0) {
      continue;
    }

    for (const trancheId of decision.frontmatter.related_tranches) {
      links.push({
        fromType: "decision",
        fromId: decision.frontmatter.id,
        toType: "tranche",
        toId: trancheId,
        reason: "decision applies to tranche",
      });
    }

    for (const artifactPath of decision.frontmatter.affected_artifacts) {
      links.push({
        fromType: "decision",
        fromId: decision.frontmatter.id,
        toType: "artifact",
        toId: artifactPath,
        reason: "decision constrains artifact",
      });
    }
  }

  for (const tranche of input.tranches) {
    if (!tranche.frontmatter || tranche.errors.length > 0) {
      continue;
    }

    for (const artifactPath of tranche.frontmatter.affected_artifacts) {
      links.push({
        fromType: "tranche",
        fromId: tranche.frontmatter.id,
        toType: "artifact",
        toId: artifactPath,
        reason: "tranche changes artifact",
      });
    }

    for (const decisionId of tranche.frontmatter.related_decisions) {
      links.push({
        fromType: "tranche",
        fromId: tranche.frontmatter.id,
        toType: "decision",
        toId: decisionId,
        reason: "tranche is linked to decision",
      });
    }
  }

  for (const handoff of [...input.planPackages, ...input.executionPackages]) {
    if (!handoff.frontmatter || handoff.errors.length > 0) {
      continue;
    }

    links.push({
      fromType: "tranche",
      fromId: handoff.frontmatter.source_tranche,
      toType: "package",
      toId: handoff.frontmatter.id,
      reason: "tranche produced handoff package",
    });
  }

  for (const review of input.reviews) {
    if (!review.frontmatter || review.errors.length > 0) {
      continue;
    }

    links.push({
      fromType: "tranche",
      fromId: review.frontmatter.source_tranche,
      toType: "review",
      toId: review.frontmatter.id,
      reason: "tranche produced review checkpoint",
    });

    for (const packageId of review.frontmatter.related_packages) {
      links.push({
        fromType: "review",
        fromId: review.frontmatter.id,
        toType: "package",
        toId: packageId,
        reason: "review assessed package coverage",
      });
    }
  }

  for (const proposalSet of input.proposalSets) {
    if (!proposalSet.frontmatter || proposalSet.errors.length > 0) {
      continue;
    }

    links.push({
      fromType: proposalSet.frontmatter.source_type === "review" ? "review" : "intake",
      fromId: proposalSet.frontmatter.source_ref,
      toType: "proposal",
      toId: proposalSet.frontmatter.id,
      reason: "source produced proposal set",
    });
  }

  for (const proposalDraft of input.proposalDrafts) {
    if (!proposalDraft.frontmatter || proposalDraft.errors.length > 0) {
      continue;
    }

    links.push({
      fromType: "proposal",
      fromId: proposalDraft.frontmatter.proposal_set_id,
      toType: "proposal",
      toId: proposalDraft.frontmatter.id,
      reason: "proposal set contains draft",
    });

    if (proposalDraft.frontmatter.status === "approved") {
      links.push({
        fromType: "proposal",
        fromId: proposalDraft.frontmatter.id,
        toType: "artifact",
        toId: proposalDraft.frontmatter.target_artifact,
        reason: "approved proposal wrote target artifact",
      });
    }
  }

  return links;
}
