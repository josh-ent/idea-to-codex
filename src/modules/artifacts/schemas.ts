import { z } from "zod";

import {
  hasNonPlaceholderWorkflowConstraint,
  hasWorkflowContext,
  missingWorkflowFields,
  type WorkflowContext,
} from "../governance/workflow.js";

export const decisionFrontmatterSchema = z.object({
  id: z.string().regex(/^DEC-\d{3}$/),
  title: z.string().min(1),
  status: z.enum(["proposed", "locked", "superseded", "rejected"]),
  date: z.preprocess(
    (value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ),
  owners: z.array(z.string().min(1)).min(1),
  related_tranches: z.array(z.string().min(1)).default([]),
  affected_artifacts: z.array(z.string().min(1)).min(1),
  supersedes: z.preprocess(
    (value) => (value === "" || value === null ? [] : value),
    z.array(z.string().min(1)).default([]),
  ),
  tags: z.array(z.string().min(1)).default([]),
});

export const trancheFrontmatterSchema = z
  .object({
    id: z.string().regex(/^TRANCHE-\d{3}$/),
    title: z.string().min(1),
    status: z.enum(["proposed", "approved", "in_progress", "complete", "superseded"]),
    priority: z.enum(["high", "medium", "low"]),
    goal: z.string().min(1),
    depends_on: z.array(z.string().min(1)).default([]),
    affected_artifacts: z.array(z.string().min(1)).min(1),
    affected_modules: z.array(z.string().min(1)).min(1),
    related_decisions: z.array(z.string().min(1)).default([]),
    related_assumptions: z.array(z.string().min(1)).default([]),
    related_terms: z.array(z.string().min(1)).default([]),
    actor: z.string().trim().min(1).optional(),
    use_case: z.string().trim().min(1).optional(),
    actor_goal: z.string().trim().min(1).optional(),
    use_case_constraints: z.array(z.string().trim().min(1)).optional(),
    review_trigger: z.string().min(1),
    acceptance_status: z.enum([
      "not_started",
      "in_progress",
      "met",
      "failed",
      "pending",
      "passed",
    ]),
  })
  .superRefine((value, context) => {
    const workflowContext: WorkflowContext = {
      actor: value.actor,
      use_case: value.use_case,
      actor_goal: value.actor_goal,
      use_case_constraints: value.use_case_constraints,
    };

    if (!hasWorkflowContext(workflowContext)) {
      return;
    }

    for (const field of missingWorkflowFields(workflowContext)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "workflow-scoped tranches require actor, use_case, actor_goal, and use_case_constraints",
      });
    }

    if (
      value.use_case_constraints &&
      !hasNonPlaceholderWorkflowConstraint(value.use_case_constraints)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["use_case_constraints"],
        message: "workflow-scoped tranches require at least one non-placeholder use_case_constraint",
      });
    }
  });

export const promptTemplateSchema = z.object({
  template_type: z.enum(["plan", "execution"]),
  required_sections: z.array(z.string().min(1)).min(1),
  target_consumer: z.string().min(1),
});

export const handoffFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["plan", "execution"]),
  status: z.enum(["draft", "approved", "superseded"]),
  source_tranche: z.string().regex(/^TRANCHE-\d{3}$/),
  related_decisions: z.array(z.string().min(1)).default([]),
  related_assumptions: z.array(z.string().min(1)).default([]),
  related_terms: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).min(1),
  validation_requirements: z.array(z.string().min(1)).min(1),
});

export const reviewFrontmatterSchema = z.object({
  id: z.string().regex(/^REVIEW-TRANCHE-\d{3}$/),
  source_tranche: z.string().regex(/^TRANCHE-\d{3}$/),
  status: z.enum(["recorded", "attention_required"]),
  review_reason: z.string().min(1),
  generated_on: z.preprocess(
    (value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ),
  related_decisions: z.array(z.string().min(1)).default([]),
  related_packages: z.array(z.string().min(1)).default([]),
  drift_signals: z.array(z.string().min(1)).default([]),
});

export const proposalSetFrontmatterSchema = z.object({
  id: z.string().regex(/^PROPOSAL-\d{3}$/),
  status: z.enum(["draft", "partially_approved", "approved", "rejected", "superseded"]),
  source_type: z.enum(["intake", "review"]),
  source_ref: z.string().min(1),
  generated_on: z.preprocess(
    (value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ),
});

export const proposalDraftFrontmatterSchema = z.object({
  id: z.string().regex(/^PROPOSAL-\d{3}(?:-[A-Z0-9]+)+$/),
  proposal_set_id: z.string().regex(/^PROPOSAL-\d{3}$/),
  status: z.enum(["draft", "approved", "rejected", "superseded"]),
  source_type: z.enum(["intake", "review"]),
  source_ref: z.string().min(1),
  target_artifact: z.string().min(1),
  target_kind: z.enum(["top_level", "record"]),
  generated_on: z.preprocess(
    (value) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ),
});

export type DecisionFrontmatter = z.infer<typeof decisionFrontmatterSchema>;
export type TrancheFrontmatter = z.infer<typeof trancheFrontmatterSchema>;
export type PromptTemplateFrontmatter = z.infer<typeof promptTemplateSchema>;
export type HandoffFrontmatter = z.infer<typeof handoffFrontmatterSchema>;
export type ReviewFrontmatter = z.infer<typeof reviewFrontmatterSchema>;
export type ProposalSetFrontmatter = z.infer<typeof proposalSetFrontmatterSchema>;
export type ProposalDraftFrontmatter = z.infer<typeof proposalDraftFrontmatterSchema>;
