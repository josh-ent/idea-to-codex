---
id: DEC-001
title: Initial stack and repository contract
status: locked
date: 2026-03-18
owners:
  - project-lead
related_tranches:
  - TRANCHE-001
affected_artifacts:
  - PLAN.md
  - ARCHITECTURE.md
  - README.md
  - package.json
  - src/server/app.ts
  - docs/tranches/TRANCHE-001-repository-contract-and-core-engine.md
supersedes: []
tags:
  - architecture
  - stack
  - governance
---

## Context

The repository started with only mission and planning documents.
The first implementation needed a concrete application stack and a durable file contract before UI work or orchestration could proceed safely.

## Decision

Use a Node backend as the operational core and a Vue.js frontend with Pinia and PrimeVue as the operator-facing UI stack.

Treat the repository itself as the v1 truth store.
Store durable records as Markdown with YAML front matter where structured metadata is required.

## Options considered

- Node backend plus Vue.js operator console over repository files.
- A database-backed system from the start.
- A docs-only repository with no running backend.

## Consequences

- Backend work can start immediately on file validation and package assembly.
- UI work stays intentionally thin until the backend contract is proven.
- v1 avoids database and multi-project complexity.

## Follow-up actions

- Implement the artefact schemas and templates.
- Build a backend validator and package assembly engine.
- Defer polished UI work until the contract and engine are stable.
