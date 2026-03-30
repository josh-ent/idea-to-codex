# Data Dictionary

## Decision Record

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable decision identifier such as `DEC-001`. |
| `title` | string | Short durable decision name. |
| `status` | enum | One of `proposed`, `locked`, `superseded`, `rejected`. |
| `date` | date string | Decision date in `YYYY-MM-DD` format. |
| `owners` | string[] | People or roles responsible for the decision. |
| `related_tranches` | string[] | Tranche identifiers affected by this decision. |
| `affected_artifacts` | string[] | Repository paths changed or constrained by the decision. |
| `supersedes` | string[] | Prior decision ids replaced by this decision. |
| `tags` | string[] | Discovery and filtering tags. |

## Tranche

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable tranche identifier such as `TRANCHE-001`. |
| `title` | string | Short tranche name. |
| `status` | enum | One of `proposed`, `approved`, `in_progress`, `complete`, `superseded`. |
| `priority` | enum | Relative priority such as `high`, `medium`, or `low`. |
| `goal` | string | The primary outcome for the tranche. |
| `depends_on` | string[] | Other tranche ids that must land first. |
| `affected_artifacts` | string[] | Repository paths expected to change. |
| `affected_modules` | string[] | Implementation areas expected to change. |
| `related_decisions` | string[] | Decision ids explicitly linked to the tranche. |
| `related_assumptions` | string[] | Assumption ids explicitly linked to the tranche. |
| `related_terms` | string[] | Glossary terms explicitly linked to the tranche. |
| `actor` | string | The Actor in the system-under-specification whose goal-driven interaction is being critiqued. Optional unless any workflow context field is present. |
| `use_case` | string | The named Use Case being planned, critiqued, or packaged. Optional unless any workflow context field is present. |
| `actor_goal` | string | The task outcome the Actor is trying to achieve in the Use Case. Optional unless any workflow context field is present. |
| `use_case_constraints` | string[] | Constraints the Use Case must respect. Optional unless any workflow context field is present; workflow-scoped tranches require at least one non-placeholder constraint. |
| `review_trigger` | string | The checkpoint condition for this tranche. |
| `acceptance_status` | enum | One of `not_started`, `in_progress`, `met`, or `failed`. |

## Handoff Package

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable package identifier. |
| `type` | enum | `plan` or `execution`. |
| `status` | enum | `draft`, `approved`, or `superseded`. |
| `source_tranche` | string | The source tranche id. |
| `related_decisions` | string[] | Decision ids included in the package. |
| `related_assumptions` | string[] | Assumption identifiers or labels included in the package. |
| `related_terms` | string[] | Glossary terms explicitly in scope. |
| `constraints` | string[] | Constraints Codex must obey. |
| `validation_requirements` | string[] | Checks required before tranche completion. |

## Review Checkpoint

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable checkpoint identifier such as `REVIEW-TRANCHE-001`. |
| `source_tranche` | string | The tranche being reviewed. |
| `status` | enum | `recorded` or `attention_required`. |
| `review_reason` | string | Why the checkpoint was triggered. |
| `generated_on` | date string | Generation date in `YYYY-MM-DD` format. |
| `related_decisions` | string[] | Decision ids considered during the checkpoint. |
| `related_packages` | string[] | Persisted package ids assessed by the checkpoint. |
| `drift_signals` | string[] | Detected first-class drift signals. |

## Trace Link

| Field | Type | Meaning |
| --- | --- | --- |
| `from_type` | string | Source entity type such as `tranche` or `decision`. |
| `from_id` | string | Source entity identifier. |
| `to_type` | string | Target entity type such as `artifact` or `package`. |
| `to_id` | string | Target entity identifier. |
| `reason` | string | Why the relationship exists. |

## Prompt Template

| Field | Type | Meaning |
| --- | --- | --- |
| `template_type` | enum | `plan` or `execution`. |
| `required_sections` | string[] | Sections that generated packages must include. |
| `target_consumer` | string | The intended agent or human consumer. |

## Material Question

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable question identifier such as `Q-001`. |
| `type` | string | Why the question exists. |
| `blocking` | boolean | Whether work can proceed safely without an answer. |
| `default_recommendation` | string | Low-regret default if the question is left unanswered. |
| `consequence_of_non_decision` | string | The risk or drift introduced by leaving the question open. |
| `affected_artifacts` | string[] | Artefacts likely to change based on the answer. |
| `status` | enum | `open`, `resolved`, or `deferred`. |
| `prompt` | string | The exact question shown to the operator. |
