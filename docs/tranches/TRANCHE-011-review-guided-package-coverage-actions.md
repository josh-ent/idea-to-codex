---
id: TRANCHE-011
title: Review-guided package coverage actions
status: complete
priority: high
goal: Turn missing package coverage findings into immediate console actions by exposing deterministic package-generation guidance in review responses and wiring those actions into the operator console.
depends_on:
  - TRANCHE-010
affected_artifacts:
  - BACKLOG.md
  - PLAN.md
  - README.md
  - docs/tranches/
  - src/modules/governance/review.ts
  - test/review.test.ts
  - test/server.test.ts
  - web/src/App.vue
  - web/src/stores/console.ts
affected_modules:
  - governance
  - server
  - ui
related_decisions: []
related_assumptions:
  - A-001
related_terms:
  - Handoff Package
  - Operator Console
  - Review Checkpoint
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Expose deterministic missing-package guidance in review responses so the console can act on package coverage gaps without scraping markdown.
- Add direct console actions for generating missing plan or execution packages from a review result.
- Surface the existing review-follow-up proposal flow directly from the review panel when the checkpoint is already `attention_required`.
- Keep the action path narrow: package coverage plus existing review follow-up, not tranche-state correction or broader review-action automation.

# Out of scope

- Automatic tranche-state correction when execution coverage is missing.
- New console actions for glossary, decision, or assumption follow-up beyond the existing review-follow-up path.
- Background review repair workflows.

# Preconditions

- Review already detects missing plan and execution package coverage deterministically.
- The package-generation route remains the canonical way to create plan and execution handoffs.
- Missing package generation remains safe because packages are derived, non-meaning-bearing artefacts.

# Acceptance criteria

- Review payloads expose which package types are missing for the reviewed tranche.
- The operator console offers direct actions to generate those missing package types from the review result.
- The operator console can launch the existing review-follow-up proposal flow directly from the review result.
- Existing stale-package regeneration actions remain intact alongside the new missing-package actions.

# Risks / tensions

- Review actions can sprawl if every finding turns into a button.
- Missing package coverage and tranche-state correction are related but not identical; conflating them would blur responsibilities.
- Operators can still choose not to follow the suggested actions, so review remains advisory rather than coercive.

# Notes

- This tranche deliberately stops at package coverage actions plus the existing review-follow-up path.
- Tranche-state correction remains a separate follow-up concern.
