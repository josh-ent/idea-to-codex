---
id: TRANCHE-007
title: Execution conduct contract
status: complete
priority: high
goal: Make execution conduct a first-class repository contract so the Studio can steer Codex toward sensible branch, worktree, and commit behaviour without becoming the system that launches Codex.
depends_on:
  - TRANCHE-001
  - TRANCHE-002
  - TRANCHE-004
affected_artifacts:
  - BACKLOG.md
  - PLAN.md
  - README.md
  - prompts/templates/execution-package.md
  - handoffs/execution/
  - src/modules/artifacts/contracts.ts
  - src/modules/artifacts/git.ts
  - src/modules/governance/policy.ts
  - src/modules/governance/review.ts
  - src/modules/packaging/service.ts
  - src/server/app.ts
  - web/src/App.vue
  - web/src/stores/console.ts
affected_modules:
  - artifacts
  - governance
  - packaging
  - server
  - ui
related_decisions: []
related_assumptions:
  - A-001
related_terms:
  - Handoff Package
  - Operator Console
  - Review Checkpoint
  - Tranche
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add a required `Execution Conduct` section to execution package templates and generated execution handoffs.
- Surface repository branch, head, and dirty-state evidence through the existing status API and operator console.
- Extend review checkpoints so dirty repository state is treated as deterministic execution-conduct drift.
- Keep execution conduct as a steering and review contract rather than introducing a Codex-launching runtime.

# Out of scope

- Direct Codex invocation, session orchestration, or managed worktree lifecycle inside the product.
- Timed commit enforcement or background git automation.
- Rich git dashboards, merge controls, or remote hosting concerns.

# Preconditions

- The Studio remains a repository-backed planning and governance layer, not the nexus that launches Codex.
- Execution guidance must stay deterministic and derived from repository truth.
- Existing package, review, and operator-console flows remain the primary surfaces for steering implementation work.

# Acceptance criteria

- Execution package templates and generated execution handoffs include explicit branch, worktree, commit, and clean-handoff expectations.
- `GET /api/status` returns repository state in a stable shape usable by the operator console.
- Review checkpoints flag dirty repository state as execution-conduct drift and recommend checkpointing or branch isolation when appropriate.
- The operator console shows repository branch, head, and dirty-file state without adding a separate git-management workflow.

# Risks / tensions

- Overstating enforcement would blur the line between steering Codex and hosting Codex.
- Review findings based on repository dirtiness alone are useful but still weaker than full execution-session control.
- Git-state visibility can become noise if the console grows into a dashboard rather than staying a compact status surface.

# Notes

- This tranche deliberately chooses prompt-and-review steering over runtime enforcement.
- Repository-state evidence is useful only if it stays small, obvious, and directly tied to review and handoff quality.
