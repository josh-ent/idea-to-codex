---
id: TRANCHE-009
title: Package quality refinement
status: complete
priority: high
goal: Refine workflow-aware handoff package quality so persisted plan and execution packages can be reviewed against current tranche truth instead of silently drifting as the repository evolves.
depends_on:
  - TRANCHE-006
  - TRANCHE-007
  - TRANCHE-008
affected_artifacts:
  - BACKLOG.md
  - PLAN.md
  - README.md
  - docs/tranches/
  - src/modules/governance/policy.ts
  - src/modules/governance/review.ts
  - test/review.test.ts
affected_modules:
  - governance
  - packaging
related_decisions: []
related_assumptions:
  - A-001
related_terms:
  - Handoff Package
  - Review Checkpoint
  - Tranche
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add deterministic package-alignment checks so review can detect when persisted plan or execution packages no longer match the package generator's current output for a tranche.
- Surface package alignment drift as an explicit review signal, finding, and corrective action.
- Keep package quality refinement narrow: compare against canonical generated output rather than inventing subjective scoring heuristics.

# Out of scope

- Automatic regeneration or approval of stale packages.
- Ranking package quality beyond deterministic alignment with repository truth.
- New package types, package versioning, or background package orchestration.

# Preconditions

- Package generation remains deterministic for a given tranche and repository state.
- Review checkpoints remain the main place where stale package drift is surfaced.
- Workflow-aware package context is already first-class from earlier tranches.

# Acceptance criteria

- Review detects stale persisted packages when their frontmatter or body no longer matches the package generator's current output.
- Clean generated packages continue to pass review without false drift.
- Review findings tell the operator to regenerate stale packages instead of inventing package content automatically.

# Risks / tensions

- Package-alignment drift can surface frequently if operators persist packages and then evolve tranche truth without regeneration.
- Comparing against canonical generated output is intentionally strict, so review must remain the enforcement surface rather than repository validation.
- Repairing stale packages remains a separate follow-up step even when detection is deterministic.

# Notes

- This tranche deliberately treats the package generator as the source of truth for package quality.
- Repair and regeneration workflow should remain separate work rather than being folded into review detection.
