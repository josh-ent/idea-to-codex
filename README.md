# Project Specification Engine

This repository contains a repository-backed specification and governance platform for preparing strong `plan this` and `do this` handoffs for Codex.

## Current scope

The current implementation focus is the first thin vertical slice from [PLAN.md](/home/jentwistle/source/idea-to-codex/PLAN.md):

- establish the repository contract;
- validate and bootstrap the durable artefact set;
- generate deterministic plan and execution packages from repository truth;
- expose a Node backend and Vue.js operator console over that contract;
- analyze vague requests into bounded intake outputs;
- persist review checkpoints and surface drift signals.
- persist approval-gated proposal drafts for meaning-bearing artefacts and apply them only after explicit operator approval.
- persist structured Actor and Use Case workflow context on workflow-scoped tranches and propagate it into review and package generation.

## Core principles

- Repository artefacts are the source of truth.
- Durable records matter more than chat summaries.
- Glossary and data dictionary consistency are first-class concerns.
- The platform prepares work for Codex; it does not replace Codex.

## Scripts

- `npm run bootstrap` creates any missing baseline artefacts and folders.
- `npm run validate` validates the repository contract and record schemas.
- `npm run package:plan -- <TRANCHE_ID>` generates a plan package snapshot.
- `npm run package:execution -- <TRANCHE_ID>` generates an execution package snapshot.
- `npm run review -- <TRANCHE_ID>` generates a persisted review checkpoint.
- `npm run proposal:intake -- "<request>"` generates a persisted proposal set from intake analysis.
- `npm run proposal:review -- <TRANCHE_ID>` generates a persisted proposal set from review findings.
- `npm run proposal:approve -- <PROPOSAL_ID>` approves one proposal draft and writes its target artefact.
- `npm run proposal:reject -- <PROPOSAL_ID>` rejects one proposal draft without mutating its target artefact.
- `npm run dev` starts the backend server.
- `npm run dev:web` starts the Vue.js operator console in development.
- `npm run test` runs the automated tests.
