# Risks

## Active risks

- `R-001`: UI work could outpace the repository contract and create a second source of truth.
- `R-002`: File schemas could drift between docs, templates, and backend validation if they are not kept aligned.
- `R-003`: Package generation could become implicit or chat-derived if traceability stays weak.
- `R-004`: Glossary and data dictionary governance could become paperwork if they do not stay tied to real record fields.

## Current mitigations

- Keep the first tranche focused on file contract, validation, traceability, and package assembly.
- Treat `GLOSSARY.md` and `DATA_DICTIONARY.md` as canonical for stable names and record fields.
- Persist decisions and tranches in real records rather than chat history.
