---
id: TRANCHE-010
title: Package repair and regeneration guidance
status: complete
priority: high
goal: Turn stale-package review findings into immediate operator actions by exposing repair metadata in review responses and offering direct package-regeneration actions in the console.
depends_on:
  - TRANCHE-009
affected_artifacts:
  - BACKLOG.md
  - PLAN.md
  - README.md
  - docs/tranches/
  - package.json
  - src/cli.ts
  - src/modules/governance/review.ts
  - src/modules/packaging/service.ts
  - src/server/app.ts
  - web/src/App.vue
  - web/src/stores/console.ts
  - test/cli.test.ts
  - test/packaging.test.ts
  - test/review.test.ts
  - test/server.test.ts
affected_modules:
  - packaging
  - server
  - governance
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

- Expose `related_packages` and `drift_signals` in the generated review response contract so the operator console can act on review findings without scraping markdown.
- Add direct console actions to regenerate stale persisted handoff packages using the existing package-generation endpoint.
- Add a deterministic package-set refresh path through CLI, API, and console so both persisted handoffs for a tranche can be regenerated together.
- Keep the repair path narrow: no new approval system, no new package artefact type, and no background automation.

# Out of scope

- Automatic package regeneration during review generation.
- New durable proposal types for handoff packages.
- Console actions for every review recommendation beyond package repair.

# Preconditions

- Review already detects stale package drift deterministically.
- Package generation remains the canonical repair path for handoff snapshots.
- Persisted packages remain non-meaning-bearing artefacts that can be regenerated without proposal approval.

# Acceptance criteria

- Review payloads expose the related package ids and drift signals needed by the console.
- When review finds stale or out-of-sync packages, the console offers direct regeneration actions for the affected package ids.
- The repo exposes a package-set refresh path that regenerates both plan and execution handoffs for a tranche through CLI, API, and console.
- The regeneration actions refresh console state after repair without introducing new durable approval artefacts.

# Risks / tensions

- Console repair actions can sprawl if every review action gets its own button.
- Operators may still need a different follow-up path for missing package coverage, since there is no stale package id to regenerate.
- Repair actions remain only as good as the underlying review signals.

# Notes

- This tranche deliberately limits UI actionability to stale package repair.
- Package-set refresh remains non-meaning-bearing because it only regenerates derived handoff artefacts.
- Missing package coverage and tranche-state correction remain separate follow-up work.
