---
id: TRANCHE-012
title: Managed project root and new project workflow
status: complete
priority: high
goal: Replace implicit Studio self-targeting with an explicit active-project workflow that can create and open managed repositories.
depends_on:
  - TRANCHE-002
  - TRANCHE-011
affected_artifacts:
  - README.md
  - PLAN.md
  - ARCHITECTURE.md
  - BACKLOG.md
  - src/server/app.ts
  - src/modules/projects/service.ts
  - src/modules/artifacts/repository.ts
  - src/modules/artifacts/contracts.ts
  - src/modules/artifacts/git.ts
  - web/src/stores/console.ts
  - web/src/components/console/OverviewSection.vue
  - web/src/App.vue
affected_modules:
  - server
  - projects
  - artifacts
  - web
related_decisions: []
related_assumptions: []
related_terms: []
review_trigger: tranche_complete
acceptance_status: met
---

# Scope

- Add an explicit active-project model so the Studio no longer assumes its own repository is the governed project.
- Support creating a brand-new managed project repository from the operator console.
- Support opening an existing local project repository from the operator console.
- Ensure project-scoped routes operate on the active managed project, not on `process.cwd()`.
- Keep application workspace state outside managed repos so project switching does not dirty repository truth.

# Out of scope

- Hosted multi-user project switching.
- Multiple simultaneously active projects.
- Remote repository cloning.
- Direct Codex launch orchestration.

# Preconditions

- The Studio remains local-first and single-operator.
- Managed project selection is application state, not durable truth inside the governed project.

# Acceptance criteria

- With no workspace state, the console opens with no active project selected.
- The operator can create a new managed project by providing a name and path.
- New project creation bootstraps a valid baseline repository and initializes git with a clean initial commit.
- The operator can open an existing local project path and the console then reflects that project's truth.
- Status, bootstrap, package, review, and proposal routes all resolve against the active managed project root.
- Validation and proposal path reporting remain relative to the managed project root instead of the Studio root.

# Risks / tensions

- Full multi-project workspace management remains deferred; v1 only supports one active local project at a time.
- Generic project bootstrap content must stay neutral and avoid leaking Studio self-description into managed repos.
- Application workspace state must not be mistaken for managed project truth.

# Notes

- Workspace state is persisted outside the managed project so project switching does not appear as repository drift.
- Existing CLI commands continue to operate directly on the current working directory for repo-local usage.
