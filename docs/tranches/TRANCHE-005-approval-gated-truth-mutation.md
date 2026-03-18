---
id: TRANCHE-005
title: Approval-gated truth mutation
status: complete
priority: high
goal: Add durable proposal sets and per-draft approval so intake and review outcomes can mutate meaning-bearing repository artefacts without bypassing governance.
depends_on:
  - TRANCHE-003
  - TRANCHE-004
affected_artifacts:
  - BACKLOG.md
  - GLOSSARY.md
  - README.md
  - docs/decisions/DEC-002-approval-gated-truth-mutation.md
  - docs/proposals/
  - src/modules/proposals/service.ts
  - src/server/app.ts
  - web/src/App.vue
affected_modules:
  - artifacts
  - governance
  - intake
  - proposals
  - server
  - traceability
  - ui
related_decisions:
  - DEC-002
related_assumptions:
  - A-003
  - A-004
related_terms:
  - Proposal Set
  - Proposal Draft
  - Material Question
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add durable proposal-set and proposal-draft records under `docs/proposals/`.
- Generate proposal drafts from intake or review outcomes for supported artefacts.
- Require blocking Material Question answers before intake-driven proposal generation.
- Apply approved proposal drafts through backend-owned write paths only.
- Extend the operator console with proposal queue, detail, and approve or reject flows.

# Out of scope

- `DATA_DICTIONARY.md` proposal writers.
- Batch approval of proposal drafts.
- Direct Codex invocation from proposal flows.

# Preconditions

- `PROJECT_AIMS.md`, `PLAN.md`, and the existing repository contract remain authoritative.
- Packages and review checkpoints already persist cleanly before proposal writes are introduced.

# Acceptance criteria

- Intake and review workflows can create durable proposal sets without mutating target artefacts immediately.
- Proposal drafts can update supported artefacts only after explicit approval.
- Rejected drafts do not change their target artefacts.
- Trace links show proposal provenance and approved target writes.
- The operator console can inspect, approve, and reject proposal drafts over backend routes.

# Risks / tensions

- Per-draft approval can temporarily leave sibling drafts unapplied and expose drift between linked artefacts.
- Proposal writers must stay deterministic; free-form patch logic would undermine governance clarity.

# Notes

- Supported proposal targets in this tranche are `BACKLOG.md`, `ASSUMPTIONS.md`, `GLOSSARY.md`, tranche records, and decision records.
- Proposal content is stored as full replacement content rather than patch hunks.
