# Architecture

## Purpose

The platform keeps project truth in repository artefacts, validates that truth, and assembles deterministic handoff packages for Codex.

`PROJECT_AIMS.md` defines mission and doctrine.
`PLAN.md` defines the intended implementation shape.
This document describes the current system structure.

## Current implementation shape

- A Node backend owns managed-project selection, file-backed bootstrap, validation, intake-session orchestration, review checkpoint generation, traceability, and package assembly.
- The backend also owns logging ingestion, the SQLite-backed `Studio Persistence Store`, and log query APIs.
- The backend also owns project-scoped `LLM Usage Record` auditing for model calls made inside the product.
- Repository artefacts remain canonical; the backend reads and writes them directly.
- A proposal layer persists approval-gated drafts under `docs/proposals/` and applies them only through backend-owned write paths.
- Workflow critique now uses durable `Actor`, `Use Case`, goal, and constraint fields on workflow-scoped tranches and reuses that context in review and package generation.
- A Vue.js + Pinia + PrimeVue operator console sits on top of the backend and stays thin: it inspects truth, generates proposal sets, and approves or rejects draft writes.
- A second dedicated frontend app at `/logs` provides read-only log viewing, search, and live tailing against the backend log store.

## Module boundaries

- `artifacts`: repository paths, baseline templates, markdown record loading, and durable writes.
- `governance`: drift signals, review triggers, review checkpoint generation, and placeholder detection for `Actor` / `Use Case` workflow critique.
- `intake`: intake-session contracts, prompt assets, session lifecycle, reconciliation, provenance, and durable `Intake Brief` state.
- `llm`: the small OpenAI structured-output adapter used by intake sessions and other hosted reasoning calls.
- `llm`: the small provider boundary for model calls and project-scoped usage auditing.
- `packaging`: plan and execution package assembly from validated repo truth.
- `logs`: query contract and service logic for persisted backend log events.
- `proposals`: proposal-set generation, proposal-draft persistence, and approval-gated truth mutation for supported artefacts.
- `traceability`: explicit links between tranches, decisions, packages, reviews, and affected artefacts.
- `server`: HTTP routes for project selection, status, bootstrap, package generation, intake sessions, review checkpoints, and proposal workflows.
- `ui`: the operator console for status inspection, intake sessions, proposal review, package generation, and checkpoint generation.
- `logs-web`: the dedicated log viewer frontend for read-only log inspection and search.

## Durable file contract

- Top-level documents define stable project truth such as architecture, glossary, assumptions, risks, and backlog.
- Decision, tranche, review, proposal, and handoff records use Markdown with YAML front matter.
- Prompt templates define the stable package structure that generated handoffs must follow.
- Intake session prompt assets live under `prompts/intake/session/` and are loaded by the backend at runtime; the application code owns lifecycle, reconciliation, and validation rather than embedded prompt prose.
- The `Studio Persistence Store` is used for durable Studio metadata such as `Log Event`, `LLM Usage Record`, `Intake Session`, `Intake Brief`, and related provenance records. It is not a project-truth store.

## Canonical loop

1. Read repository truth.
2. Validate required artefacts and record schemas.
3. Bootstrap missing baseline files when needed.
4. Run an intake session or review context and generate durable proposal drafts for supported meaning-bearing artefacts.
5. Approve or reject proposal drafts per artefact.
6. Select a tranche and derive linked decisions, assumptions, and constraints.
7. Generate a plan or execution package snapshot.
8. Run a review checkpoint when tranche state or drift signals warrant it.
9. Persist generated packages, proposals, and review checkpoints in the repo.

## Deferred work

- Proposal writers for `DATA_DICTIONARY.md` and other meaning-bearing artefacts beyond the current supported set.
- Direct Codex invocation from inside the product.
