# Architecture

## Purpose

The platform keeps project truth in repository artefacts, validates that truth, and assembles deterministic handoff packages for Codex.

`PROJECT_AIMS.md` defines mission and doctrine.
`PLAN.md` defines the intended implementation shape.
This document describes the current system structure.

## Current implementation shape

- A Node backend owns file-backed bootstrap, validation, intake analysis, review checkpoint generation, traceability, and package assembly.
- Repository artefacts remain canonical; the backend reads and writes them directly.
- A Vue.js + Pinia + PrimeVue operator console sits on top of the backend and stays read-mostly except for backend-mediated package and review writes.

## Module boundaries

- `artifacts`: repository paths, baseline templates, markdown record loading, and durable writes.
- `governance`: drift signals, review triggers, and review checkpoint generation.
- `intake`: deterministic request classification and Material Question generation.
- `packaging`: plan and execution package assembly from validated repo truth.
- `traceability`: explicit links between tranches, decisions, packages, reviews, and affected artefacts.
- `server`: HTTP routes for status, bootstrap, package generation, intake analysis, and review checkpoints.
- `ui`: the operator console for status inspection, package generation, intake review, and checkpoint generation.

## Durable file contract

- Top-level documents define stable project truth such as architecture, glossary, assumptions, risks, and backlog.
- Decision, tranche, review, and handoff records use Markdown with YAML front matter.
- Prompt templates define the stable package structure that generated handoffs must follow.

## Canonical loop

1. Read repository truth.
2. Validate required artefacts and record schemas.
3. Bootstrap missing baseline files when needed.
4. Select a tranche and derive linked decisions, assumptions, and constraints.
5. Generate a plan or execution package snapshot.
6. Run a review checkpoint when tranche state or drift signals warrant it.
7. Persist generated packages and review checkpoints in the repo.

## Deferred work

- Approval-gated durable rewriting of meaning-bearing artefacts from intake output.
- Model-backed translation beyond the current deterministic intake path.
- Direct Codex invocation from inside the product.
