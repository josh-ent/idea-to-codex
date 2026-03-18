---
id: TRANCHE-001
title: Repository contract and core engine
status: complete
priority: high
goal: Establish the durable file contract and backend logic required to validate artefacts and assemble deterministic handoff packages.
depends_on: []
affected_artifacts:
  - README.md
  - ARCHITECTURE.md
  - GLOSSARY.md
  - DATA_DICTIONARY.md
  - ASSUMPTIONS.md
  - RISKS.md
  - BACKLOG.md
  - docs/decisions/DEC-001-initial-stack-and-repo-contract.md
  - prompts/templates/plan-package.md
  - prompts/templates/execution-package.md
affected_modules:
  - artifacts
  - governance
  - packaging
  - traceability
  - server
related_decisions:
  - DEC-001
related_assumptions:
  - A-001
  - A-002
  - A-003
  - A-004
related_terms:
  - Artefact
  - Decision Record
  - Tranche
  - Handoff Package
  - Trace Link
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Create the baseline durable artefacts required by the plan.
- Implement backend bootstrap and validation over the repository contract.
- Implement deterministic plan and execution package generation.
- Expose minimal backend routes for status, bootstrap, and package generation.

# Out of scope

- The operator console UI.
- Selective question generation.
- Direct Codex invocation.

# Preconditions

- `PROJECT_AIMS.md` and `PLAN.md` remain authoritative.
- Repository truth stays file-backed.

# Acceptance criteria

- Missing baseline artefacts can be created automatically.
- Record schemas for decisions, tranches, and packages validate cleanly.
- Package generation is driven by repository truth and persists snapshots.
- Trace links between tranche, decisions, artefacts, and generated packages are explicit.

# Risks / tensions

- Schema drift between docs and code.
- Overbuilding API shape before the UI exists.

# Notes

- Keep the backend small and file-centric.
- Plan and execution package snapshots are now generated under `handoffs/`.
