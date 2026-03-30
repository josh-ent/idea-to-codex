---
id: PLAN-TRANCHE-001
type: plan
status: approved
source_tranche: TRANCHE-001
related_decisions: ["DEC-001"]
related_assumptions: ["A-001", "A-002", "A-003", "A-004"]
related_terms: ["Artefact", "Decision Record", "Tranche", "Handoff Package", "Trace Link"]
constraints: ["Repository artefacts are the source of truth.", "Do not create duplicate truth stores.", "Keep v1 single-project and file-backed.", "Prefer the smallest durable implementation that proves the workflow.", "Do not let UI work outrun the repository contract."]
validation_requirements: ["Run repository validation.", "Run automated tests.", "Keep glossary, data dictionary, decisions, and tranche references aligned.", "Missing baseline artefacts can be created automatically.", "Record schemas for decisions, tranches, and packages validate cleanly.", "Package generation is driven by repository truth and persists snapshots.", "Trace links between tranche, decisions, artefacts, and generated packages are explicit."]
---

# Objective

Establish the durable file contract and backend logic required to validate artefacts and assemble deterministic handoff packages.

# Scope

- Create the baseline durable artefacts required by the plan.
- Implement backend bootstrap and validation over the repository contract.
- Implement deterministic plan and execution package generation.
- Expose minimal backend routes for status, bootstrap, and package generation.

# Workflow Context

- No Actor-scoped workflow context is defined for this tranche.

# Relevant Artefacts

- PROJECT_AIMS.md
- PLAN.md
- ARCHITECTURE.md
- GLOSSARY.md
- DATA_DICTIONARY.md
- ASSUMPTIONS.md
- RISKS.md
- README.md
- BACKLOG.md
- docs/decisions/DEC-001-initial-stack-and-repo-contract.md
- prompts/templates/plan-package.md
- prompts/templates/execution-package.md

# Locked Decisions

- DEC-001: Initial stack and repository contract (locked)

# Active Assumptions

- A-001: The repository is single-project and local-first for v1.
- A-002: Durable records use Markdown with YAML front matter where schema validation matters.
- A-003: The backend may persist package snapshots automatically because packages do not change project meaning by themselves.
- A-004: Human approval is still required before durable writes that alter mission, locked decisions, or other meaning-bearing artefacts.

# Constraints

- Repository artefacts are the source of truth.
- Do not create duplicate truth stores.
- Keep v1 single-project and file-backed.
- Prefer the smallest durable implementation that proves the workflow.
- Do not let UI work outrun the repository contract.

# Deferred Questions

- How much automated artefact rewriting is acceptable before explicit human approval is required.
- Whether the default review cadence should remain “per tranche or after five durable artefact mutations”.
- Whether v1 should stop at strong package export or also invoke Codex directly once the repo contract is stable.

# Expected Output

- Produce a repository-oriented implementation plan.
- Keep scope, risks, and validation explicit.

# Planning Success Criteria

- Missing baseline artefacts can be created automatically.
- Record schemas for decisions, tranches, and packages validate cleanly.
- Package generation is driven by repository truth and persists snapshots.
- Trace links between tranche, decisions, artefacts, and generated packages are explicit.

# Out Of Scope

- The operator console UI.
- Selective question generation.
- Direct Codex invocation.

# Risks / Tensions

- Schema drift between docs and code.
- Overbuilding API shape before the UI exists.

# Related Terms

- Artefact: A versioned repository item that carries project truth.
- Decision Record: A durable record of an explicit project decision, its rationale, and its consequences.
- Tranche: A bounded unit of work approved for planning, execution, and review.
- Handoff Package: A persisted plan or execution prompt assembled from repository truth for Codex.
- Trace Link: A causal link between requests, artefacts, decisions, tranches, and packages.
