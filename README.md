# Project Specification Engine

This repository contains a repository-backed specification and governance platform for preparing strong `plan this` and `do this` handoffs for Codex.

## Current scope

The current implementation focus is the first thin vertical slice from [PLAN.md](/home/jentwistle/source/idea-to-codex/PLAN.md):

- establish the repository contract;
- validate and bootstrap the durable artefact set;
- manage one explicit active project instead of implicitly governing the Studio repo;
- generate deterministic plan and execution packages from repository truth;
- expose a Node backend and Vue.js operator console over that contract;
- analyze vague requests into bounded intake outputs through model-backed intake analysis;
- persist review checkpoints and surface drift signals.
- persist approval-gated proposal drafts for meaning-bearing artefacts and apply them only after explicit operator approval.
- re-validate proposal relationships and roll back any approval that would leave repository truth invalid.
- persist structured Actor and Use Case workflow context on workflow-scoped tranches and propagate it into review and package generation.
- include execution-conduct expectations in execution handoffs and surface repository branch and dirty-state evidence in the operator console.
- detect stale persisted handoff packages when they drift from the current tranche truth.
- offer direct package-regeneration actions from review output when stale handoffs are detected.
- offer direct review-panel actions for missing package coverage.
- create a new managed project repository or open an existing local project from the operator console.

## Core principles

- Repository artefacts are the source of truth.
- Durable records matter more than chat summaries.
- Glossary and data dictionary consistency are first-class concerns.
- The platform prepares work for Codex; it does not replace Codex.

## Repository workflow

- Treat git history as part of the durable project record, not an afterthought.
- Do meaningful work on a branch or worktree rather than directly on long-lived shared state.
- Make frequent, sensible, atomic commits as coherent checkpoints.
- Do not allow long-running uncommitted work to accumulate.
- Prefer commit messages that describe the repository change clearly, as a professional engineering team would.
- Validate the changed slice before committing, and run full repo checks before landing tranche-sized work.

## Scripts

- `npm run bootstrap` creates any missing baseline artefacts and folders in the current repository.
- `npm run validate` validates the repository contract and record schemas.
- `npm run package:plan -- <TRANCHE_ID>` generates a plan package snapshot.
- `npm run package:execution -- <TRANCHE_ID>` generates an execution package snapshot.
- `npm run package:refresh -- <TRANCHE_ID>` regenerates and persists the plan and execution package set for a tranche.
- `npm run review -- <TRANCHE_ID>` generates a persisted review checkpoint.
- `npm run intake:analyze -- "<request>"` prints the canonical intake analysis contract for the current project root.
- `npm run proposal:intake -- "<request>"` generates a persisted proposal set from intake analysis.
- `npm run proposal:review -- <TRANCHE_ID>` generates a persisted proposal set from review findings.
- `npm run proposal:approve -- <PROPOSAL_ID>` approves one proposal draft and writes its target artefact.
- `npm run proposal:reject -- <PROPOSAL_ID>` rejects one proposal draft without mutating its target artefact.
- `npm run dev` starts the backend server.
- `npm run dev:web` starts the Vue.js operator console in development.
- `npm run test` runs the automated tests.

## Backend logging

- Backend logs write to stderr with timestamps, scope labels, request ids, and operation durations.
- Development defaults to full verbosity with `trace` level logging.
- Production defaults to `info`.
- Test runs default to `error` to keep automated output readable.
- Override the level with `IDEA_TO_CODEX_LOG_LEVEL=trace|debug|info|warn|error|silent` or `LOG_LEVEL=...`.

## Intake analysis

- Intake analysis is now model-backed and uses the OpenAI Responses API with structured outputs.
- The backend owns the canonical schema, stable question ids, question prompts, blocking flags, and metadata hashes.
- `material_questions[].id` is the stable key used for answers and deterministic proposal generation.
- `material_questions[].display_id` is presentation-only.
- Intake analysis is advisory. Proposal drafts remain approval-gated before any target artefact changes.
- Configure the intake lane with `OPENAI_API_KEY`, optional `OPENAI_INTAKE_MODEL` or `OPENAI_BROAD_REASONING_MODEL`, and optional `OPENAI_RESPONSES_TIMEOUT_MS`.

## First use

- Start the backend with `npm run dev`.
- Start the console with `npm run dev:web`.
- Open the operator console and create a new managed project or open an existing local project path.
- After a project is selected, the console operates on that managed repository rather than on the Studio repo.
