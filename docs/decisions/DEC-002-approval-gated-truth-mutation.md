---
id: DEC-002
title: Approval-gated truth mutation for meaning-bearing artefacts
status: locked
date: 2026-03-18
owners:
  - project-lead
related_tranches:
  - TRANCHE-005
affected_artifacts:
  - ARCHITECTURE.md
  - BACKLOG.md
  - GLOSSARY.md
  - README.md
  - src/modules/proposals/service.ts
  - src/server/app.ts
  - web/src/stores/console.ts
supersedes: []
tags:
  - governance
  - approval
  - repository-truth
---

# Context

The platform needed to start mutating meaning-bearing repository truth without weakening governance posture.
Purely ephemeral previews would not satisfy the repository-first doctrine, but direct automatic rewrites would bypass the operator at exactly the point where product meaning can change.

# Decision

Persist proposal drafts as durable records under `docs/proposals/`, grouped into proposal sets derived from intake or review events.

Require explicit operator approval before a proposal draft may rewrite its target artefact.
Approval remains per draft, not per set.
Packages and review checkpoints may still persist automatically because they do not change product meaning by themselves.

# Options considered

- Persist durable proposal drafts and apply them only after explicit approval.
- Show proposals only in the UI until approval.
- Rewrite target artefacts immediately from intake or review output.

# Consequences

- The repo keeps a durable record of proposed truth changes before approval.
- The operator can approve or reject each artefact mutation independently.
- Review and traceability can now link intake or review events to proposal drafts and to approved target writes.

# Follow-up actions

- Extend proposal writers to more artefact types only when their contracts are explicit enough to stay deterministic.
- Keep the console thin and let the backend own all proposal generation and approval writes.
