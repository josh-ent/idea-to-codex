---
id: TRANCHE-003
title: Selective intake and material question generation
status: complete
priority: medium
goal: Add a thin intake-analysis path that classifies vague requests, identifies affected artefacts, and surfaces only material questions using explicit repo rules.
depends_on:
  - TRANCHE-001
  - TRANCHE-002
affected_artifacts:
  - PLAN.md
  - BACKLOG.md
  - GLOSSARY.md
  - DATA_DICTIONARY.md
affected_modules:
  - intake
  - governance
  - ui
related_decisions:
  - DEC-001
related_assumptions:
  - A-001
  - A-004
related_terms:
  - Material Question
  - Operator Console
  - Tranche
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Accept a vague request and produce a bounded intake analysis.
- Identify likely affected artefacts and modules.
- Generate only material questions using explicit governance rules.
- Expose the result through backend APIs and the operator console.

# Out of scope

- Automatic durable rewrites of meaning-bearing artefacts.
- Deep model-driven planning or execution.
- Direct Codex invocation.

# Preconditions

- The backend contract and operator console remain intact.
- Question generation stays selective and explainable.

# Acceptance criteria

- A vague request produces a deterministic intake analysis.
- Material questions include impact, blocking status, and default recommendation.
- The operator can inspect the intake result from the UI.
- The intake layer does not become a general chat surface.

# Risks / tensions

- Heuristics could become too shallow to be useful or too broad to stay selective.
- A future model-backed path could diverge if the rule-based contract is not kept explicit.

# Notes

- Start with explicit rules and bounded output before adding model-backed translation.
- The current implementation keeps intake deterministic and read-mostly.
