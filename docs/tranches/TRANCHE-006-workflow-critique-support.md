---
id: TRANCHE-006
title: Workflow critique support
status: complete
priority: high
goal: Add bounded workflow critique support that stays tied to named Actors, named Use Cases, Actor goals, and explicit constraints so the platform can challenge weak workflow design without collapsing into vague UX commentary.
depends_on:
  - TRANCHE-003
  - TRANCHE-004
  - TRANCHE-005
affected_artifacts:
  - BACKLOG.md
  - DATA_DICTIONARY.md
  - GLOSSARY.md
  - PLAN.md
  - PROJECT_AIMS.md
  - README.md
  - handoffs/plan/
  - handoffs/execution/
  - prompts/templates/plan-package.md
  - prompts/templates/execution-package.md
  - src/modules/artifacts/schemas.ts
  - src/modules/governance/workflow.ts
  - src/modules/intake/service.ts
  - src/modules/governance/review.ts
  - src/modules/packaging/service.ts
  - src/modules/proposals/service.ts
  - src/server/app.ts
  - web/src/App.vue
  - web/src/stores/console.ts
affected_modules:
  - intake
  - governance
  - packaging
  - proposals
  - server
  - ui
related_decisions:
  - DEC-002
related_assumptions:
  - A-001
  - A-004
related_terms:
  - Actor
  - Material Question
  - Operator Console
  - Proposal Set
  - Review Checkpoint
  - Use Case
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Extend workflow-related intake so requests affecting interfaces or operational flows are anchored to a named Actor, named Use Case, Actor goal, and explicit constraints.
- Add deterministic workflow critique outputs that call out task mismatch, unnecessary ceremony, system-oriented flow design, and missing edge-case coverage only when those anchors exist.
- Carry the approved workflow anchors through proposal generation, review follow-up, and Codex package context for workflow-related tranches.
- Expose workflow critique inputs and outputs through the backend and operator console without turning either surface into a general UX chat tool.
- Keep critique support approval-gated wherever it proposes durable truth changes.

# Out of scope

- Visual styling, aesthetic commentary, or pixel-level design review.
- Free-form product critique that is not tied to a named Actor, Use Case, goal, and constraint set.
- Direct UI implementation or Codex invocation from the critique workflow.
- Broad package-quality hardening unrelated to workflow context.

# Preconditions

- Existing intake, proposal, package, and review flows remain deterministic and repository-backed.
- Workflow critique triggers stay selective and do not fire for ordinary non-workflow changes.
- Human approval remains required before meaning-bearing artefacts mutate.
- `Actor` means the actor in the system being specified, not a collaborator inside this single-operator platform.

# Acceptance criteria

- Workflow-related intake requests ask for the named Actor, named Use Case, Actor goal, and relevant constraints before critique-driven proposals can proceed.
- Workflow critique output is concrete and actor-bound rather than generic UX advice.
- Review follow-up for workflow-related tranches can produce durable, approval-gated proposals or actions grounded in the same workflow anchors.
- Plan and execution packages for workflow-related tranches include the approved workflow context needed to keep Codex task-oriented.
- Non-workflow requests can still pass through intake, proposals, and packages without extra critique ceremony.

# Risks / tensions

- Triggering critique too broadly would create paperwork and slow reversible work.
- Named Actors, Use Cases, or goals could become placeholder text that creates false precision instead of clarity.
- Critique rules could drift into subjective commentary if the outputs are not kept explicit and narrow.

# Notes

- Start with deterministic Actor and Use Case critique rules before considering any model-backed critique path.
- Prefer extending existing tranche, proposal, review, and package artefacts over introducing a separate workflow-truth subsystem.
