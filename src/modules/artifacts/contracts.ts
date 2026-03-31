export const requiredTopLevelFiles = [
  "PROJECT_AIMS.md",
  "PLAN.md",
  "ARCHITECTURE.md",
  "GLOSSARY.md",
  "DATA_DICTIONARY.md",
  "ASSUMPTIONS.md",
  "RISKS.md",
  "BACKLOG.md",
  "README.md",
] as const;

export const requiredDirectories = [
  "docs/decisions",
  "docs/proposals",
  "docs/reviews",
  "docs/tranches",
  "prompts/templates",
  "handoffs/plan",
  "handoffs/execution",
] as const;

export const decisionSections = [
  "Context",
  "Decision",
  "Options considered",
  "Consequences",
  "Follow-up actions",
] as const;

export const trancheSections = [
  "Scope",
  "Out of scope",
  "Preconditions",
  "Acceptance criteria",
  "Risks / tensions",
  "Notes",
] as const;

export const reviewSections = [
  "Summary",
  "Trigger",
  "Package Coverage",
  "Drift Signals",
  "Findings",
  "Recommended Actions",
  "Durable Changes",
] as const;

export const proposalSetSections = [
  "Summary",
  "Source Context",
  "Drafts",
] as const;

export const proposalDraftSections = [
  "Summary",
  "Source Context",
  "Proposed Content",
] as const;

export const planTemplateSections = [
  "Objective",
  "Scope",
  "Workflow Context",
  "Relevant Artefacts",
  "Locked Decisions",
  "Active Assumptions",
  "Constraints",
  "Deferred Questions",
  "Expected Output",
  "Planning Success Criteria",
] as const;

export const executionTemplateSections = [
  "Objective",
  "Scope",
  "Workflow Context",
  "Relevant Artefacts",
  "Locked Decisions",
  "Active Assumptions",
  "Constraints",
  "Execution Conduct",
  "Validation Requirements",
  "Review Triggers",
  "Definition Of Done",
] as const;

export const defaultConstraints = [
  "Repository artefacts are the source of truth.",
  "Do not create duplicate truth stores.",
  "Keep v1 single-project and file-backed.",
  "Prefer the smallest durable implementation that proves the workflow.",
  "Do not let UI work outrun the repository contract.",
] as const;

export const defaultValidationChecks = [
  "Run repository validation.",
  "Run automated tests.",
  "Keep glossary, data dictionary, decisions, and tranche references aligned.",
] as const;

export const defaultExecutionConduct = [
  "Work on a branch or worktree rather than accumulating long-running implementation changes in shared state.",
  "Make frequent, sensible, atomic commits at meaningful checkpoints.",
  "Do not allow long-running dirty state to accumulate.",
  "Report branch name, latest commit SHA, changed files, and checks run in progress updates.",
  "Leave the repository in a committed state before handing the tranche back for review.",
] as const;

export function baselineTemplates(projectName: string) {
  return [
    {
      path: "README.md",
      content: `# ${projectName}

This repository contains the durable project truth for ${projectName}.

## Current scope

- Capture project aims, architecture, backlog, decisions, and tranche records.
- Keep glossary and data dictionary terms explicit and consistent.
- Generate plan, execution, proposal, and review artefacts from repository truth.
`,
    },
    {
      path: "PROJECT_AIMS.md",
      content: `# Project Aims

## Summary

Define the product vision, outcome, and non-goals for ${projectName} here.
`,
    },
    {
      path: "PLAN.md",
      content: `# Plan

## 18. Open Questions That Genuinely Need Answering

- None.
`,
    },
    {
      path: "ARCHITECTURE.md",
      content: `# Architecture

## Purpose

Describe the current implementation shape of ${projectName} here.
`,
    },
    {
      path: "GLOSSARY.md",
      content: `# Glossary

## Artefact

- Canonical name: \`Artefact\`
- Allowed aliases: \`artifact\`
- Definition: A versioned repository item that carries project truth.
- Notes / usage constraints: Use for durable repository records and generated handoffs.
`,
    },
    {
      path: "DATA_DICTIONARY.md",
      content: `# Data Dictionary

## Decision Record

| Field | Type | Meaning |
| --- | --- | --- |
| \`id\` | string | Stable decision identifier. |
`,
    },
    {
      path: "ASSUMPTIONS.md",
      content: `# Assumptions

## Active assumptions

- Capture active assumptions here.
`,
    },
    {
      path: "RISKS.md",
      content: `# Risks

## Active risks

- Capture active risks here.
`,
    },
    {
      path: "BACKLOG.md",
      content: `# Backlog

## Active tranches

- None.

## Completed tranches

- None.

## Next candidate tranches

- None yet.
`,
    },
    {
      path: "docs/decisions/TEMPLATE.md",
      content: `---
id: DEC-XXX
title: Replace this title
status: proposed
date: YYYY-MM-DD
owners: []
related_tranches: []
affected_artifacts: []
supersedes: []
tags: []
---

# Context

# Decision

# Options considered

# Consequences

# Follow-up actions
`,
    },
    {
      path: "docs/reviews/TEMPLATE.md",
      content: `---
id: REVIEW-TRANCHE-XXX
source_tranche: TRANCHE-XXX
status: recorded
review_reason: tranche_complete
generated_on: YYYY-MM-DD
related_decisions: []
related_packages: []
drift_signals: []
---

# Summary

# Trigger

# Package Coverage

# Drift Signals

# Findings

# Recommended Actions

# Durable Changes
`,
    },
    {
      path: "docs/tranches/TEMPLATE.md",
      content: `---
id: TRANCHE-XXX
title: Replace this title
status: proposed
priority: medium
goal: Replace this goal
depends_on: []
affected_artifacts: []
affected_modules: []
related_decisions: []
related_assumptions: []
related_terms: []
review_trigger: tranche_complete
acceptance_status: not_started
---

# Scope

# Out of scope

# Preconditions

# Acceptance criteria

# Risks / tensions

# Notes
`,
    },
    {
      path: "prompts/templates/plan-package.md",
      content: `---
template_type: plan
required_sections:
  - Objective
  - Scope
  - Workflow Context
  - Relevant Artefacts
  - Locked Decisions
  - Active Assumptions
  - Constraints
  - Deferred Questions
  - Expected Output
  - Planning Success Criteria
target_consumer: Codex
---

# Objective

# Scope

# Workflow Context

# Relevant Artefacts

# Locked Decisions

# Active Assumptions

# Constraints

# Deferred Questions

# Expected Output

# Planning Success Criteria
`,
    },
    {
      path: "prompts/templates/execution-package.md",
      content: `---
template_type: execution
required_sections:
  - Objective
  - Scope
  - Workflow Context
  - Relevant Artefacts
  - Locked Decisions
  - Active Assumptions
  - Constraints
  - Execution Conduct
  - Validation Requirements
  - Review Triggers
  - Definition Of Done
target_consumer: Codex
---

# Objective

# Scope

# Workflow Context

# Relevant Artefacts

# Locked Decisions

# Active Assumptions

# Constraints

# Execution Conduct

# Validation Requirements

# Review Triggers

# Definition Of Done
`,
    },
  ] as const;
}
