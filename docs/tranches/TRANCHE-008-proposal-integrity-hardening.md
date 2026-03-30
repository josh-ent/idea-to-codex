---
id: TRANCHE-008
title: Proposal integrity hardening
status: complete
priority: high
goal: Strengthen proposal-era cross-record validation so proposal sets and drafts cannot drift silently, and make proposal approval refuse any draft that would leave repository truth invalid.
depends_on:
  - TRANCHE-005
  - TRANCHE-006
  - TRANCHE-007
affected_artifacts:
  - BACKLOG.md
  - PLAN.md
  - README.md
  - docs/proposals/
  - docs/tranches/
  - src/modules/artifacts/repository.ts
  - src/modules/proposals/service.ts
affected_modules:
  - artifacts
  - proposals
related_decisions: []
related_assumptions:
  - A-001
related_terms:
  - Proposal Draft
  - Proposal Set
  - Tranche
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add repository validation for broken proposal cross-links across proposal sets, drafts, and review-sourced references.
- Treat proposal sets without drafts as invalid repository state.
- Make proposal approval transactional so a draft cannot be approved if its proposed content would leave the repository invalid.
- Preserve the existing approval-gated proposal workflow without adding background orchestration or approval batching.

# Out of scope

- Package body quality scoring beyond existing section and workflow-context checks.
- Automatic superseding of sibling drafts after one approval.
- Direct Codex invocation, proposal bundles, or multi-step approval transactions.

# Preconditions

- Proposal sets and drafts remain file-backed records under `docs/proposals/`.
- Repository validation remains the canonical gate for durable repository correctness.
- Proposal approval continues to be operator-triggered and per-draft.

# Acceptance criteria

- Repository validation reports broken proposal set and draft relationships deterministically.
- Review-sourced proposal sets fail validation when they reference missing reviews.
- Proposal approval rolls back target writes when the approved content would leave the repository invalid.
- Failed approval attempts leave proposal draft status and target artefacts unchanged.

# Risks / tensions

- Validation hardening can surface pre-existing proposal drift that was previously ignored.
- Transactional approval is still per-draft, so coherent multi-draft rollouts remain an operator responsibility.
- Package-quality refinement remains separate work even after proposal integrity is hardened.

# Notes

- This tranche intentionally hardens proposal integrity first because proposal approval is the meaning-bearing write path.
- Remaining package-quality refinement should move into the next tranche rather than stretching this one into a broader validation bucket.
