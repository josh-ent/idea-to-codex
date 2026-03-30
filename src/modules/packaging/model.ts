import {
  defaultConstraints,
  defaultValidationChecks,
} from "../artifacts/contracts.js";
import type {
  DecisionFrontmatter,
  TrancheFrontmatter,
} from "../artifacts/schemas.js";
import { workflowContextLines } from "../governance/workflow.js";

export interface PackageAssumption {
  id: string;
  text: string;
}

export interface PackageGlossaryTerm {
  term: string;
  definition: string;
  notes: string;
}

export function linkedDecisionsForTranche(
  tranche: TrancheFrontmatter,
  decisions: DecisionFrontmatter[],
): DecisionFrontmatter[] {
  return decisions.filter(
    (decision) =>
      tranche.related_decisions.includes(decision.id) ||
      decision.related_tranches.includes(tranche.id),
  );
}

export function linkedAssumptionsForTranche(
  tranche: TrancheFrontmatter,
  assumptions: PackageAssumption[],
): PackageAssumption[] {
  return assumptions.filter((assumption) =>
    tranche.related_assumptions.length === 0
      ? true
      : tranche.related_assumptions.includes(assumption.id),
  );
}

export function linkedGlossaryTermsForTranche(
  tranche: TrancheFrontmatter,
  glossaryTerms: PackageGlossaryTerm[],
): PackageGlossaryTerm[] {
  return glossaryTerms.filter((term) =>
    tranche.related_terms.length === 0 ? true : tranche.related_terms.includes(term.term),
  );
}

export function packageConstraints(): string[] {
  return [...defaultConstraints];
}

export function packageValidationRequirements(acceptanceCriteria: string[]): string[] {
  return [...defaultValidationChecks, ...acceptanceCriteria];
}

export function expectedWorkflowContextLines(tranche: TrancheFrontmatter): string[] {
  return workflowContextLines(tranche);
}
