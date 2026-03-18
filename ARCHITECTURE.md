# Architecture

## Purpose

The platform keeps project truth in repository artefacts, validates that truth, and assembles deterministic handoff packages for Codex.

`PROJECT_AIMS.md` defines mission and doctrine.
`PLAN.md` defines the intended implementation shape.
This document describes the current system structure.

## Current implementation shape

- A Node backend owns file-backed bootstrap, validation, intake analysis, review checkpoint generation, traceability, and package assembly.
- Repository artefacts remain canonical; the backend reads and writes them directly.
- A proposal layer persists approval-gated drafts under `docs/proposals/` and applies them only through backend-owned write paths.
- A Vue.js + Pinia + PrimeVue operator console sits on top of the backend and stays thin: it inspects truth, generates proposal sets, and approves or rejects draft writes.

## Module boundaries

- `artifacts`: repository paths, baseline templates, markdown record loading, and durable writes.
- `governance`: drift signals, review triggers, and review checkpoint generation.
- `intake`: deterministic request classification and Material Question generation.
- `packaging`: plan and execution package assembly from validated repo truth.
- `proposals`: proposal-set generation, proposal-draft persistence, and approval-gated truth mutation for supported artefacts.
- `traceability`: explicit links between tranches, decisions, packages, reviews, and affected artefacts.
- `server`: HTTP routes for status, bootstrap, package generation, intake analysis, review checkpoints, and proposal workflows.
- `ui`: the operator console for status inspection, intake analysis, proposal review, package generation, and checkpoint generation.

## Durable file contract

- Top-level documents define stable project truth such as architecture, glossary, assumptions, risks, and backlog.
- Decision, tranche, review, proposal, and handoff records use Markdown with YAML front matter.
- Prompt templates define the stable package structure that generated handoffs must follow.

## Canonical loop

1. Read repository truth.
2. Validate required artefacts and record schemas.
3. Bootstrap missing baseline files when needed.
4. Analyze intake or review context and generate durable proposal drafts for supported meaning-bearing artefacts.
5. Approve or reject proposal drafts per artefact.
6. Select a tranche and derive linked decisions, assumptions, and constraints.
7. Generate a plan or execution package snapshot.
8. Run a review checkpoint when tranche state or drift signals warrant it.
9. Persist generated packages, proposals, and review checkpoints in the repo.

## Deferred work

- Proposal writers for `DATA_DICTIONARY.md` and other meaning-bearing artefacts beyond the current supported set.
- Model-backed translation beyond the current deterministic intake path.
- Direct Codex invocation from inside the product.
