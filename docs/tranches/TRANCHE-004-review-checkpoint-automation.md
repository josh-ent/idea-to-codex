---
id: TRANCHE-004
title: Review checkpoint automation and stronger drift detection
status: complete
priority: medium
goal: Add a deterministic review checkpoint path that persists checkpoint records, surfaces drift signals, and closes the first end-to-end governance loop.
depends_on:
  - TRANCHE-001
  - TRANCHE-002
  - TRANCHE-003
affected_artifacts:
  - README.md
  - ARCHITECTURE.md
  - DATA_DICTIONARY.md
  - BACKLOG.md
  - PLAN.md
  - docs/reviews/TEMPLATE.md
affected_modules:
  - governance
  - artifacts
  - traceability
  - server
  - ui
related_decisions:
  - DEC-001
related_assumptions:
  - A-001
  - A-004
related_terms:
  - Review Checkpoint
  - Tranche
  - Trace Link
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Persist one review checkpoint record per tranche.
- Generate deterministic drift signals from repository truth and tranche state.
- Expose review checkpoint generation through the backend and operator console.
- Keep checkpoint output review-oriented rather than turning it into automated artefact rewriting.

# Out of scope

- Automatic mutation of meaning-bearing artefacts after review.
- Deep implementation-aware static analysis.
- Direct Codex invocation.

# Preconditions

- Tranche, package, and glossary state remain file-backed.
- Review checkpoint output remains explainable from repository state.

# Acceptance criteria

- A review checkpoint can be generated and persisted for an existing tranche.
- The checkpoint records package coverage, drift signals, findings, and recommended actions.
- Trace links include persisted review checkpoints and their related packages.
- The operator can trigger and inspect a checkpoint from the UI.

# Risks / tensions

- Heuristic drift signals may be too weak if they are not kept explicit and narrow.
- Review output could become theatre if it stops leading to durable repo changes when needed.

# Notes

- V1 keeps one authoritative checkpoint record per tranche.
- The next step after this tranche is approval-gated truth mutation from accepted review or intake outcomes.
