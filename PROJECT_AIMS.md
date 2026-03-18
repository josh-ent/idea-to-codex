# PROJECT AIMS

## WORKING TITLE

Project Specification Engine

## PURPOSE

Build a repository-backed specification and governance platform that helps humans define, refine, and maintain the intent of a software product, then package that intent into high-quality planning and execution inputs for Codex.

This platform is not a coding engine.
It is not a general-purpose autonomous software company.
It is a structured documentation, decision, and prompt-packaging system that sits above the repository and improves the quality, continuity, and usefulness of agent-driven software delivery.

Its primary job is to reduce ambiguity, preserve project truth, control drift, and create durable artefacts that can be handed to Codex in two clean stages:

1. Plan this.
2. Do this.

## PRODUCT THESIS

Current LLM-assisted software work breaks down in predictable ways:

- requirements live in chat rather than versioned artefacts;
- key decisions are implied, forgotten, or inconsistently applied;
- project terminology drifts over time;
- context is partial, assumed, or lost;
- architecture intent is weakly enforced;
- documentation quality collapses as implementation accelerates;
- the interface for steering the project is poor;
- review/refactor loops happen inconsistently and too late.

The platform should solve those problems by making repository documentation the operational source of truth and by providing a focused UI for humans to manage:

- mission;
- product direction;
- architecture intent;
- goals and milestones;
- decisions and trade-offs;
- glossary and data dictionary;
- open questions and assumptions;
- implementation tranches;
- review/refactor checkpoints;
- planning and execution payloads for Codex.

## PRIMARY USERS

### 1. TECHNICAL PRODUCT OWNER / PROJECT LEAD
A technically literate human who understands the broad problem and desired outcome, but does not want to manually manage every architectural, documentation, and prompt-structuring concern.

Needs:
- structured clarification flows;
- strong visibility of open questions and unresolved assumptions;
- support for choosing between options with consequences made explicit;
- confidence that the repo documentation remains coherent and useful to agents.

### 2. ARCHITECT / ENGINEERING LEAD
A human responsible for the integrity of architecture, decomposition, and delivery quality.

Needs:
- durable decisions;
- explicit constraints;
- traceable rationale;
- drift detection between architecture, implementation, and documentation;
- prompt packages that preserve intent without hand-holding.

### 3. CODEX
The implementation-focused agent that consumes planning and execution bundles.

Needs:
- clear goals;
- bounded scope;
- strong project context;
- stable terminology;
- explicit constraints;
- unambiguous definitions of done;
- documented decisions and known assumptions.

## NON-GOALS

This platform must not become:

- a replacement for Codex;
- a general chat wrapper around a repository;
- a passive wiki;
- a bloated project management suite;
- a requirement to route every engineering decision through a supervisory LLM;
- an excuse to generate large volumes of low-value documentation.

It must not attempt to own ordinary local implementation choices unless they conflict with declared product, architectural, or governance intent.

## CORE PRODUCT BEHAVIOUR

The platform must support the following operating model:

1. A human provides a high-level product goal, change request, or problem statement.
2. The platform interprets that input and converts it into durable project artefacts.
3. The platform identifies ambiguity, missing definitions, terminology drift, and unresolved decisions.
4. The platform asks only the questions that materially affect product value, architecture direction, workflow semantics, governance posture, or delivery risk.
5. The platform updates project artefacts to reflect the newly clarified truth.
6. The platform assembles a planning package for Codex.
7. Codex produces a plan.
8. The platform allows the human to inspect, refine, accept, or redirect that plan.
9. The platform assembles an execution package for Codex.
10. Codex implements.
11. The platform triggers review, critique, and refactor loops at defined intervals or gates.
12. The platform updates project artefacts again to reflect the outcome of implementation and subsequent decisions.

## PRIMARY CAPABILITIES

### 1. SPECIFICATION MANAGEMENT
The platform must maintain and help evolve the durable documentation set for the project.

At minimum, it should support:

- project mission;
- product aims;
- active scope;
- exclusions / non-goals;
- architectural principles;
- glossary;
- data dictionary;
- decision records;
- assumptions register;
- risks and tensions;
- backlog / tranche queue;
- acceptance criteria;
- prompt packages for planning and execution.

### 2. DECISION HANDLING
The platform must manage explicit decisions, not bury them in conversation history.

It should:
- surface decision points when needed;
- present options, consequences, and tensions;
- record chosen outcomes and rationale;
- distinguish between provisional and locked decisions;
- show which artefacts are affected by a decision.

### 3. QUESTION DISCIPLINE
The platform must ask questions selectively and with intent.

It should ask when:
- product meaning is ambiguous;
- user workflow semantics are unclear;
- terminology is undefined or drifting;
- a decision is expensive to reverse;
- architecture direction materially changes;
- compliance, governance, or privacy posture is unclear;
- implementation would otherwise proceed on a hidden assumption.

It should not ask about:
- reversible local coding choices;
- minor implementation details that do not affect stated intent;
- issues already resolved in project artefacts.

### 4. PROMPT PACKAGING
The platform must prepare structured prompt payloads for Codex.

There are two primary package types:

#### A. PLAN PACKAGE
Used for: "Codex, plan this."

Must include:
- objective;
- current scope boundary;
- relevant documentation references;
- constraints;
- assumptions;
- decisions already locked;
- questions explicitly deferred;
- desired output format;
- definition of planning success.

#### B. EXECUTION PACKAGE
Used for: "Codex, do this."

Must include:
- approved tranche or task;
- implementation scope;
- relevant architecture and contract artefacts;
- coding constraints;
- validation requirements;
- refactor/review triggers;
- definition of done.

### 5. REVIEW / REFACTOR LOOPS
The platform must support intentional pauses for critique and consolidation.

It should be able to trigger review loops:
- after a configurable number of meaningful changes;
- after a completed tranche;
- after a major design shift;
- when documentation and implementation appear to diverge;
- before merge / release candidate formation.

Review loops may include:
- architectural coherence review;
- UX / workflow critique;
- terminology and glossary reconciliation;
- documentation drift check;
- refactor opportunity assessment;
- simplification pass;
- risk review.

### 6. UX / WORKFLOW CRITIQUE
If the product being specified includes user interfaces or operational workflows, the platform must explicitly challenge whether the design serves real user goals.

Questions of this class include:
- Does this actually serve the user?
- Does this workflow minimise friction for the stated task?
- Are we forcing the user to think in system terms rather than task terms?
- Is there unnecessary ceremony, duplication, or navigation depth?
- Are edge cases defined and visible?
- Is the workflow aligned to the intended actor, not an imagined ideal user?

These critiques must be tied to named users, workflows, goals, and constraints, not vague aesthetic commentary.

### 7. DOCUMENTATION GOVERNANCE
The platform must treat repo documentation as an operational system, not an afterthought.

It should:
- detect missing required artefacts;
- identify inconsistent terminology;
- detect stale or conflicting definitions;
- surface undocumented assumptions;
- show when implementation appears to have outpaced documentation;
- preserve change history through version control rather than chat memory.

## FOUNDATIONAL PRINCIPLES

### 1. REPOSITORY TRUTH OVER CHAT MEMORY
If it matters, it must be represented in versioned artefacts.

### 2. MINIMUM DURABLE DOCUMENTATION
Create the smallest documentation set that preserves project integrity and improves Codex output.
No documentation theatre.

### 3. EXPLICIT TERMINOLOGY
Glossary and data dictionary are first-class controls, not optional extras.

### 4. STRUCTURED AMBIGUITY MANAGEMENT
Unknowns must be classified, surfaced, and either resolved or explicitly deferred.

### 5. HUMAN AUTHORITY AT HIGH-IMPACT DECISION POINTS
The human decides on meaning, priorities, and irreversible trade-offs.
The system prepares those decisions well.

### 6. CODEX DOES EXECUTION
This platform packages, governs, critiques, and maintains truth.
Codex plans and delivers.

### 7. REVERSIBLE BY DEFAULT
The system should allow progress under low-regret assumptions where appropriate, but must surface assumptions clearly.

## EXPECTED REPOSITORY ARTEFACTS

The exact set may evolve, but the platform should be designed to manage artefacts such as:

- `PROJECT_AIMS.md`
- `MISSION.md`
- `ARCHITECTURE.md`
- `GLOSSARY.md`
- `DATA_DICTIONARY.md`
- `ASSUMPTIONS.md`
- `RISKS.md`
- `BACKLOG.md`
- `ACCEPTANCE_CRITERIA.md`
- `docs/decisions/DEC-xxx.md`
- `prompts/PLAN_PACKAGE.md`
- `prompts/EXECUTION_PACKAGE.md`

## INITIAL SUCCESS CRITERIA

The first useful version of the platform should be able to:

1. ingest a high-level project aim;
2. create and maintain a coherent baseline documentation set;
3. surface missing questions and unresolved assumptions;
4. manage explicit decision points;
5. generate a strong planning package for Codex;
6. generate a strong execution package for Codex;
7. trigger review/refactor loops after meaningful progress;
8. keep glossary and data definitions aligned with the evolving project;
9. make project direction easier to steer than ordinary chat;
10. reduce context loss and semantic drift across a long-running build.

## QUALITY BAR

The platform is successful only if it materially improves:

- the coherence of repo documentation;
- the quality of prompts sent to Codex;
- the stability of project terminology;
- the visibility of decisions and assumptions;
- the usefulness of review/refactor loops;
- the human experience of steering a long-running agentic project.

If it merely adds more interface, more chat, or more documentation without improving delivery integrity, it has failed.

## FIRST PRINCIPLE SUMMARY

Build a specification engine that creates and maintains the smallest durable set of repository truths required for Codex to reliably plan and execute useful work without semantic drift.