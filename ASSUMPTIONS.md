# Assumptions

## Active assumptions

- `A-001`: The repository is single-project and local-first for v1.
- `A-002`: Durable records use Markdown with YAML front matter where schema validation matters.
- `A-003`: The backend may persist package snapshots automatically because packages do not change project meaning by themselves.
- `A-004`: Human approval is still required before durable writes that alter mission, locked decisions, or other meaning-bearing artefacts.

## Resolved assumptions

- None yet.

## Deferred decisions

- The exact approval policy for broader automated artefact rewriting remains open.
- Direct Codex invocation remains deferred until package quality is proven.
