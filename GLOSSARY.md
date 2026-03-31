# Glossary

## Artefact

- Canonical name: `Artefact`
- Allowed aliases: `artifact`
- Definition: A versioned repository item that carries project truth.
- Disallowed or deprecated synonyms: `doc blob`, `note`
- Related entities: `Decision Record`, `Tranche`, `Handoff Package`, `Trace Link`
- Notes / usage constraints: Use `Artefact` in prose. Field names may still use `artifact` in snake_case for schema stability.

## Decision Record

- Canonical name: `Decision Record`
- Allowed aliases: `decision`
- Definition: A durable record of an explicit project decision, its rationale, and its consequences.
- Disallowed or deprecated synonyms: `ADR`
- Related entities: `Tranche`, `Handoff Package`
- Notes / usage constraints: Decision outcomes are not durable until recorded here.

## Tranche

- Canonical name: `Tranche`
- Allowed aliases: `work tranche`
- Definition: A bounded unit of work approved for planning, execution, and review.
- Disallowed or deprecated synonyms: `epic`, `sprint`
- Related entities: `Decision Record`, `Handoff Package`, `Review Checkpoint`
- Notes / usage constraints: Package generation is tranche-scoped.

## Handoff Package

- Canonical name: `Handoff Package`
- Allowed aliases: `package`
- Definition: A persisted plan or execution prompt assembled from repository truth for Codex.
- Disallowed or deprecated synonyms: `prompt blob`
- Related entities: `Tranche`, `Decision Record`
- Notes / usage constraints: Package content must be derivable from repo state, not chat history.

## Trace Link

- Canonical name: `Trace Link`
- Allowed aliases: `trace`
- Definition: A causal link between requests, artefacts, decisions, tranches, and packages.
- Disallowed or deprecated synonyms: `implicit reference`
- Related entities: `Decision Record`, `Tranche`, `Handoff Package`
- Notes / usage constraints: Trace links make provenance explicit.

## Review Checkpoint

- Canonical name: `Review Checkpoint`
- Allowed aliases: `checkpoint`
- Definition: A deliberate review event that assesses drift, coherence, and simplification opportunities.
- Disallowed or deprecated synonyms: `retro`
- Related entities: `Tranche`, `Risk`
- Notes / usage constraints: Persist only meaningful outcomes of a checkpoint.

## Glossary Term

- Canonical name: `Glossary Term`
- Allowed aliases: `term`
- Definition: A controlled term whose meaning must remain stable across docs, schemas, and prompts.
- Disallowed or deprecated synonyms: `loose wording`
- Related entities: `Data Dictionary Entry`
- Notes / usage constraints: Stable names belong here first.

## Data Dictionary Entry

- Canonical name: `Data Dictionary Entry`
- Allowed aliases: `data entry`
- Definition: The definition of a field, entity, or structure used in durable artefacts.
- Disallowed or deprecated synonyms: `field note`
- Related entities: `Glossary Term`
- Notes / usage constraints: Repeated fields in front matter and records must be described here.

## Operator Console

- Canonical name: `Operator Console`
- Allowed aliases: `console`
- Definition: The human-facing frontend used to steer the system without editing raw files directly.
- Disallowed or deprecated synonyms: `dashboard app`
- Related entities: `Tranche`, `Handoff Package`
- Notes / usage constraints: The console depends on backend truth; it does not replace it.

## Log Event

- Canonical name: `Log Event`
- Allowed aliases: `log entry`
- Definition: One persisted backend logging record with a timestamp, level, scope, message, request context, project context, and structured payload.
- Disallowed or deprecated synonyms: `raw line`
- Related entities: `Log Viewer`, `Operator Console`
- Notes / usage constraints: `Log Event` records are observability data only and do not become project truth.

## Log Viewer

- Canonical name: `Log Viewer`
- Allowed aliases: `logs app`
- Definition: The dedicated read-only frontend used to tail, search, and inspect persisted backend log events.
- Disallowed or deprecated synonyms: `ops dashboard`
- Related entities: `Log Event`, `Operator Console`
- Notes / usage constraints: The `Log Viewer` is separate from the `Operator Console` and is optimized for observability rather than truth mutation.

## Actor

- Canonical name: `Actor`
- Allowed aliases: `workflow actor`, `role`
- Definition: The external person or system role whose goal-driven interaction with the system-under-specification is being described or critiqued.
- Disallowed or deprecated synonyms: `user` when it could be confused with the single operator using this platform
- Related entities: `Material Question`, `Operator Console`, `Tranche`, `Use Case`
- Notes / usage constraints: Use `Actor` for workflow critique and product-specification context. Do not use it to describe collaborators inside this repository-backed platform unless the platform itself is the product being specified.

## Use Case

- Canonical name: `Use Case`
- Allowed aliases: `workflow`
- Definition: A named goal-oriented interaction between an Actor and the system-under-specification that provides the durable unit for workflow critique.
- Disallowed or deprecated synonyms: `flow area`, `generic journey`
- Related entities: `Actor`, `Material Question`, `Tranche`
- Notes / usage constraints: Use `use_case` as the structured tranche field name. Plain `workflow` remains acceptable prose where it reads better.

## Material Question

- Canonical name: `Material Question`
- Allowed aliases: `question`
- Definition: A question raised only when the answer affects product meaning, workflow semantics, architecture direction, governance posture, terminology, or another expensive-to-reverse choice.
- Disallowed or deprecated synonyms: `chat prompt`, `generic clarification`
- Related entities: `Actor`, `Tranche`, `Decision Record`, `Operator Console`
- Notes / usage constraints: Routine reversible implementation choices do not become Material Questions.

## Proposal Set

- Canonical name: `Proposal Set`
- Allowed aliases: `proposal set`
- Definition: A grouped, durable set of proposal drafts produced from one intake or review event.
- Disallowed or deprecated synonyms: `batch patch`, `draft bundle`
- Related entities: `Proposal Draft`, `Material Question`, `Review Checkpoint`
- Notes / usage constraints: Approval is per draft, not per set.

## Proposal Draft

- Canonical name: `Proposal Draft`
- Allowed aliases: `proposal`, `draft`
- Definition: An approval-gated full-content replacement for one target artefact.
- Disallowed or deprecated synonyms: `auto edit`, `patch hunk`
- Related entities: `Proposal Set`, `Artefact`
- Notes / usage constraints: The proposed content is durable, but the target artefact is not mutated until the operator approves the draft.
