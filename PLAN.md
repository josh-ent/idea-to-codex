# Repository Plan For The Project Specification Engine

## 1. Executive Summary

Build a single-repository, local-first specification and governance platform that treats repository artefacts as the operational source of truth and packages that truth into clean Codex handoffs.

The product is not a coding engine. It is a project truth engine.

Its job is to:
- turn vague human intent into durable repository artefacts;
- manage decisions, assumptions, risks, terminology, and scope;
- assemble strong `plan this` and `do this` packages for Codex;
- trigger review and refactor loops when project truth or implementation quality is at risk;
- reduce semantic drift across long-running work.

The first release should prove one thin end-to-end governance loop, not build a broad platform.

## 2. What This Product Is And Is Not

### It is
- a repository-backed specification engine;
- a decision and assumption management layer;
- a glossary and data dictionary steward;
- a prompt-packaging layer for Codex planning and execution;
- an operator console for steering project direction, architecture intent, and review discipline.

### It is not
- a replacement for Codex;
- a generic project-management suite;
- a passive documentation wiki;
- a general chat shell over a repo;
- a bureaucratic supervisory layer for routine engineering choices;
- a pretext for overbuilding orchestration before the documentation contract works.

### Authority model
- Humans own product meaning, scope, terminology, architecture direction, and irreversible trade-offs.
- Core GPT-style reasoning supports translation, critique, and clarification.
- Codex owns approved planning and implementation work.
- Repository artefacts remain the only durable source of truth.

## 3. Observations From The Current Repo State

- The repo now has the baseline durable artefacts, initial decision and tranche records, prompt templates, generated handoff snapshots, and a file-backed Node backend.
- This is good: the repository contract is now explicit enough to validate and generate packages deterministically.
- The repo now also has a Vue.js operator console, deterministic intake analysis, and persisted review checkpoints.
- The next meaningful gap is package quality refinement over workflow-aware repo truth now that proposal integrity is hardened.
- `PROJECT_AIMS.md` remains the mission-level anchor and must not be duplicated by later docs or UI state.

## 4. Product Doctrine

### Repository truth over chat memory
If a fact, decision, definition, or constraint matters, it must exist in a versioned repository artefact.

### Minimum durable documentation
The goal is the smallest documentation set that materially improves planning, execution, and drift control. Avoid documentation theatre.

### Explicit terminology
Glossary and data dictionary are first-class controls. Undefined or drifting language is a defect.

### Selective questioning
Only ask humans about matters that materially affect meaning, workflow semantics for the intended Actor, architecture, governance posture, or expensive-to-reverse choices.

### Low-regret progress
Where a reversible assumption is acceptable, state it, record it, and continue.

### Codex remains the execution engine
This platform improves inputs, preserves truth, and manages review discipline. It does not try to out-Codex Codex.

## 5. Canonical First End-To-End Loop

The platform must prove this exact loop before expanding:

1. A human enters one vague but realistic project request.
2. The system classifies the request and identifies affected artefacts.
3. The system raises only the material questions needed to proceed.
4. The resulting answers become:
   - one or more decisions;
   - explicit assumptions where needed;
   - updated glossary or data dictionary entries where needed;
   - updated backlog / tranche records.
5. The system writes those truth changes into repository artefacts.
6. The system produces one planning package for Codex.
7. The human reviews the package and confirms it.
8. The system produces one execution package for Codex.
9. After implementation, the system runs one review/refactor checkpoint.
10. The system persists only meaningful outputs of that checkpoint.

If v1 cannot do that cleanly, the platform is not yet working.

## 6. Recommended Repository / Documentation Baseline

### Top-level authoritative files
- `PROJECT_AIMS.md`
- `PLAN.md`
- `ARCHITECTURE.md`
- `GLOSSARY.md`
- `DATA_DICTIONARY.md`
- `ASSUMPTIONS.md`
- `RISKS.md`
- `BACKLOG.md`
- `README.md`

### Record folders
- `docs/decisions/`
- `docs/proposals/`
- `docs/reviews/`
- `docs/tranches/`
- `prompts/templates/`
- `handoffs/plan/`
- `handoffs/execution/`

### Explicit exclusions for v1
- no `MISSION.md` because it would duplicate `PROJECT_AIMS.md`;
- no global `ACCEPTANCE_CRITERIA.md`; acceptance belongs on tranche records and handoff packages;
- no database-backed truth store;
- no hosted collaboration model;
- no multi-project workspace model.

### Storage conventions
- Use Markdown with small YAML front matter for durable records.
- Persist approved snapshots, not every draft iteration.
- Prefer one authoritative home for each category of truth.
- Treat git branches, worktrees, and commits as part of the operating system of the repo, not external process.
- Prefer frequent atomic commits over long-running dirty worktrees.

## 7. Required Artefact Schemas

The platform should not “figure out file shapes later”. File schemas are part of the product contract.

### 7.1 Decision record schema
Each `DEC-xxx.md` should carry at least:
- `id`
- `title`
- `status` (`proposed|locked|superseded|rejected`)
- `date`
- `owners`
- `related_tranches`
- `affected_artifacts`
- `supersedes`
- `tags`

Body sections:
- Context
- Decision
- Options considered
- Consequences
- Follow-up actions

### 7.2 Tranche schema
Each tranche record should carry at least:
- `id`
- `title`
- `status` (`proposed|approved|in_progress|complete|superseded`)
- `priority`
- `goal`
- `depends_on`
- `affected_artifacts`
- `affected_modules`
- `review_trigger`
- `acceptance_status`

Body sections:
- Scope
- Out of scope
- Preconditions
- Acceptance criteria
- Risks / tensions
- Notes

### 7.3 Handoff package schema
Both plan and execution packages should carry at least:
- `id`
- `type` (`plan|execution`)
- `status` (`draft|approved|superseded`)
- `source_tranche`
- `related_decisions`
- `related_assumptions`
- `related_terms`
- `constraints`
- `validation_requirements`

Body sections vary by package type but must be stable and machine-readable enough to validate.

### 7.4 Glossary term schema
Each term should define:
- canonical name;
- allowed aliases;
- definition;
- disallowed or deprecated synonyms;
- related entities;
- notes / usage constraints.

### 7.5 Data dictionary entry schema
Each entry should define:
- canonical field or entity name;
- type / structure;
- meaning;
- allowed values or rules;
- source of truth;
- related workflows;
- notes / constraints.

### 7.6 Question schema
Material questions should carry:
- `id`
- `type`
- `blocking`
- `default_recommendation`
- `consequence_of_non_decision`
- `affected_artifacts`
- `status`

### 7.7 Review checkpoint schema
Each review record should carry at least:
- `id`
- `source_tranche`
- `status` (`recorded|attention_required`)
- `review_reason`
- `generated_on`
- `related_decisions`
- `related_packages`
- `drift_signals`

Body sections:
- Summary
- Trigger
- Package Coverage
- Drift Signals
- Findings
- Recommended Actions
- Durable Changes

## 8. Proposed Product Architecture

Use a Node backend with a Vue.js frontend using Pinia for client state and PrimeVue for the component layer, backed directly by repository files.

### Modules
- `artifacts`: parse, validate, diff, and write canonical repo artefacts.
- `governance`: question handling, escalation logic, review triggers, drift signals.
- `packaging`: assemble validated plan and execution packages.
- `intake`: turn vague requests into structured proposed changes.
- `traceability`: maintain causal links between requests, questions, decisions, artefacts, tranches, and packages.
- `ui`: operator-facing workflow.
- `llm`: adapters for core GPT reasoning, Codex packaging, and higher-effort review/research paths.

### Design rule
No separate database in v1 unless file-backed operation proves insufficient. The repo is the truth store.

## 9. Core Entities

The minimum core entities are:
- Artefact
- Decision
- Assumption
- Risk
- Glossary Term
- Data Dictionary Entry
- Question
- Tranche
- Review Checkpoint
- Handoff Package
- Proposal Set
- Proposal Draft
- Trace Link

### Missing concept added deliberately: Trace Link
The system must explicitly model provenance and impact:
- which request caused which questions;
- which answers produced which decisions;
- which decisions changed which artefacts;
- which artefacts shaped which tranche;
- which tranche produced which package.

Without traceability, the platform will look organised while still relying on implicit memory.

## 10. Core Workflows

### 10.1 Bootstrap workflow
- Read `PROJECT_AIMS.md`.
- Detect missing baseline artefacts.
- Create the minimum baseline structure.
- Establish initial glossary, assumptions, and tranche queue.

### 10.2 Change intake workflow
- Accept a vague human request.
- Classify it by affected domains and artefacts.
- Detect missing terms, undefined data, or architectural ambiguity.
- Ask only material questions.
- Propose changes to durable artefacts.
- Persist approved truth updates.

### 10.3 Planning handoff workflow
- Select an approved tranche.
- Assemble a plan package from repository truth only.
- Present the package for review.
- Persist the approved package snapshot.

### 10.4 Execution handoff workflow
- Assemble an execution package from repository truth plus the approved tranche.
- Include constraints, terminology, validations, and review triggers.
- Persist the approved package snapshot.

### 10.5 Review / refactor workflow
- Trigger a checkpoint.
- Evaluate architecture coherence, glossary/data consistency, documentation drift, workflow fit, simplification opportunities, and unresolved tensions.
- Persist only meaningful outputs.

## 11. Decision / Escalation Model

Escalate only when one or more of these are affected:
- product meaning;
- workflow semantics for the intended Actor;
- architecture direction;
- governance, compliance, or privacy posture;
- terminology or data definition integrity;
- expensive-to-reverse design choices;
- handoff package quality for major work.

Do not escalate:
- reversible local implementation choices;
- coding details already bounded by architecture and glossary;
- matters already resolved in authoritative artefacts.

Every escalated question must include:
- type;
- why it matters;
- blocking vs non-blocking status;
- recommended default;
- consequence of non-decision;
- affected artefacts.

Decision outcomes must be persisted as records, not left in chat.

## 12. Prompt Packaging Model

### Rule
Packages are built from repository truth plus a selected tranche, never from chat memory alone.

### Plan package must contain
- objective;
- in-scope / out-of-scope boundary;
- relevant artefacts;
- locked decisions;
- active assumptions;
- constraints;
- deferred questions;
- expected output format;
- planning success criteria.

### Execution package must contain
- approved tranche;
- target changes;
- affected docs and modules;
- glossary terms and data entries in scope;
- coding and architecture constraints;
- validation checks;
- review triggers;
- definition of done.

### Persistence
- Templates live under `prompts/templates/`.
- Approved package snapshots live under `handoffs/plan/` and `handoffs/execution/`.
- Snapshot IDs should be stable and traceable to tranche and decision records.

## 13. Review / Refactor Model

### Explicit trigger modes
Support these trigger classes from the start:
- end of each approved tranche;
- any architecture-affecting decision;
- any glossary or data model change;
- N durable artefact mutations since last review;
- manual checkpoint.

### Default v1 policy
- Review at tranche end.
- Review after any architecture-affecting decision.
- Review after glossary or data dictionary change.
- Review after five durable artefact mutations, unless a review happened sooner.

### Meaningful review outputs only
A review should only persist:
- changed artefacts;
- new or updated decision records;
- retired assumptions;
- updated risks;
- backlog / tranche changes;
- explicit “no durable change required” result when appropriate.

### First-class drift signals
At minimum:
- implementation outpaced docs;
- docs outpaced implementation;
- terminology drift detected;
- architecture intent drift detected.

## 14. Use Of Models Inside The OpenAI Ecosystem

### Core GPT-style reasoning
Use for:
- intent translation;
- requirement clarification;
- option framing;
- selective questioning;
- critique of workflow or UX;
- glossary and data dictionary reconciliation.

### Codex
Use for:
- planning against approved packages;
- implementation against approved execution packages;
- repo-aware execution work.

### Higher-effort reasoning / research
Reserve for:
- architecture ambiguity;
- major product direction questions;
- challenge sessions against the current design;
- difficult UX/workflow critique;
- non-trivial external-knowledge questions.

### Governance rule
Reasoning output from any model is not project truth until it is written back into repository artefacts under the platform’s governance rules.

## 15. Risks, Tensions, And Likely Failure Modes

- Building a polished front end before the repository contract is proven.
- Treating chat summaries as truth instead of persisting them.
- Allowing the translation layer to become a synthetic middle manager.
- Over-designing orchestration or agents before package quality is proven.
- Creating too many files with overlapping responsibility.
- Failing to define file schemas early and then inventing them ad hoc during implementation.
- Producing reviews that create paperwork rather than truth updates.
- Making traceability implicit and losing causal chains between requests, decisions, and packages.

## 16. Phased Implementation Plan

### Phase 1: repository contract
Establish the file model and validation contract.

Deliver:
- baseline top-level docs;
- decision record schema;
- tranche schema;
- handoff package schemas;
- glossary and data dictionary structures;
- review trigger model;
- traceability model.

Exit condition:
- the repo contract is explicit enough that Codex handoff packages can be assembled deterministically.

Status:
- implemented in the current repo.

### Phase 2: file-backed core engine
Build the core logic over the repo.

Deliver:
- artefact parser / validator;
- missing-artefact detection;
- glossary and data consistency checks;
- traceability store over repo artefacts;
- package assembly engine;
- durable write discipline.

Exit condition:
- the system can read, validate, update, and assemble repo truth reliably.

Status:
- implemented for bootstrap, validation, trace links, package generation, and package persistence.

### Phase 3: operator console
Build the minimal UI, but keep it operator-first.

Deliver:
- overview dashboard;
- open questions view;
- decisions view;
- glossary/data dictionary view;
- tranche/backlog view;
- package generation view.

Exit condition:
- a human can run the canonical loop without touching raw files directly for common operations.

Status:
- implemented for status inspection, tranche selection, package generation, intake inspection, and review checkpoint generation.

### Phase 4: selective intelligence
Add narrowly scoped LLM-assisted governance features.

Deliver:
- change intake classification;
- material question generation;
- review/refactor support;
- workflow critique support;
- stronger drift detection.

Exit condition:
- the system improves project truth quality without becoming bureaucratic.

Status:
- implemented for deterministic intake classification, Material Question generation, review checkpoint generation, and first-pass drift signals.

### Phase 5: hardening
Deliver:
- end-to-end tests;
- package quality checks;
- stricter validation rules;
- cleaner Codex handoff ergonomics;
- more robust review/reporting.

Defer:
- multi-project support;
- hosted auth and collaboration;
- heavy autonomous orchestration;
- elaborate agent management UI.

Status:
- implemented for proposal-era approval gating and proposal integrity hardening; remaining work is package quality refinement over workflow-aware repo truth.

## 17. Recommended First Tranche

Build one thin vertical slice that proves the complete governance loop.

Status:
- implemented through `TRANCHE-005`, including approval-gated durable truth mutation from intake and review outputs.

### Scope
- baseline repo artefact creation;
- artefact schema validation;
- glossary and data dictionary editing;
- decision capture;
- tranche creation;
- plan package generation;
- execution package generation;
- one review/refactor checkpoint result.

### Explicit demo scenario
Starting from only `PROJECT_AIMS.md`, the system must be able to:
1. create missing baseline artefacts without duplicating mission truth;
2. ingest one vague change request;
3. ask only material questions;
4. record at least one decision and one assumption;
5. update affected artefacts;
6. create one approved tranche;
7. emit one plan package;
8. emit one execution package;
9. run one checkpoint and persist only meaningful results.

### Default v1 policies
- Markdown plus YAML front matter;
- single repo / single project only;
- human approval before durable writes that alter meaning or locked decisions;
- proposal drafts persist before approval; target artefacts mutate only after per-draft approval;
- manual export or copy into Codex is acceptable initially;
- operator console over raw file editing, not a polished end-user app.
- active implementation work should happen on a branch or worktree;
- meaningful progress should be captured in frequent, sensible commits;
- tranche-sized work should not sit uncommitted for extended periods.

### Acceptance criteria
- The canonical loop works end-to-end.
- Package assembly uses repo truth, not chat memory.
- Drift between terms, decisions, assumptions, and packages is detectable.
- The backend API and persisted artefacts are sufficient to support the operator console tranche cleanly.
- No duplicate mission truth is introduced.

## 18. Open Questions That Genuinely Need Answering

- Whether the default review cadence should remain “per tranche or after five durable artefact mutations”.
- Whether v1 should stop at strong package export or also invoke Codex directly once the repo contract is stable.

## 19. Immediate Next Actions

1. Build `TRANCHE-009`: refine package quality so workflow-aware handoffs stay explicit, aligned, and reviewable as repo truth grows.
2. Keep the translation layer narrow so it proposes repo changes without becoming a chat supervisor.
3. Extend review quality only where it materially improves drift detection rather than adding paperwork.
