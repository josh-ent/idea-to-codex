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

## Material Question

- Canonical name: `Material Question`
- Allowed aliases: `question`
- Definition: A question raised only when the answer affects product meaning, workflow semantics, architecture direction, governance posture, terminology, or another expensive-to-reverse choice.
- Disallowed or deprecated synonyms: `chat prompt`, `generic clarification`
- Related entities: `Tranche`, `Decision Record`, `Operator Console`
- Notes / usage constraints: Routine reversible implementation choices do not become Material Questions.
