---
id: TRANCHE-002
title: Minimal operator console
status: complete
priority: high
goal: Add the first Vue.js + Pinia + PrimeVue operator console over backend status, tranche, and package flows without weakening the repository contract.
depends_on:
  - TRANCHE-001
affected_artifacts:
  - package.json
  - README.md
  - ARCHITECTURE.md
  - PLAN.md
  - BACKLOG.md
affected_modules:
  - ui
  - server
related_decisions:
  - DEC-001
related_assumptions:
  - A-001
  - A-002
  - A-004
related_terms:
  - Operator Console
  - Tranche
  - Handoff Package
  - Glossary Term
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add a minimal Vue.js operator console using Pinia and PrimeVue.
- Show backend status, errors, decisions, tranches, review checkpoints, open questions, glossary terms, and package outputs.
- Let the operator generate plan packages, execution packages, and review checkpoints from the UI.
- Keep the UI read-mostly and route durable package writes through the backend.

# Out of scope

- Rich editing of glossary, assumptions, or tranche records.
- Selective question generation.
- Direct Codex invocation.

# Preconditions

- `TRANCHE-001` remains complete and the backend contract stays file-backed.
- The UI consumes backend APIs rather than reimplementing repo logic.

# Acceptance criteria

- The operator can load a project overview without touching raw files.
- The operator can inspect decisions, tranches, review checkpoints, open questions, and glossary terms from the UI.
- The operator can generate plan and execution packages for `TRANCHE-001` from the UI.
- The operator can generate a review checkpoint for a selected tranche from the UI.
- The backend remains the only owner of durable package writes.

# Risks / tensions

- The UI could drift into a second truth surface if it starts owning workflow logic.
- PrimeVue breadth could tempt unnecessary UI complexity too early.

# Notes

- The console now remains thin by routing all durable writes through backend APIs.
