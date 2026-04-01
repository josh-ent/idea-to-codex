import { z } from "zod";

export const proposalSessionStatuses = ["active", "stale", "completed", "abandoned"] as const;
export const proposalPassStatuses = ["running", "completed", "failed"] as const;
export const proposalDraftStatuses = [
  "current",
  "stale",
  "superseded",
  "approved",
  "rejected",
] as const;

export const proposalSessionStatusSchema = z.enum(proposalSessionStatuses);
export const proposalPassStatusSchema = z.enum(proposalPassStatuses);
export const proposalDraftStatusSchema = z.enum(proposalDraftStatuses);

export const proposalSessionSchema = z.object({
  id: z.string().min(1),
  intake_session_id: z.string().min(1),
  intake_brief_version_id: z.string().min(1),
  status: proposalSessionStatusSchema,
  current_input_snapshot_id: z.string().min(1).nullable(),
  current_pass_id: z.string().min(1).nullable(),
  proposal_session_revision: z.number().int().nonnegative(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const proposalInputSnapshotSchema = z.object({
  id: z.string().min(1),
  proposal_session_id: z.string().min(1),
  intake_brief_version_id: z.string().min(1),
  selected_input_manifest_json: z.record(z.string(), z.unknown()),
  manifest_hash: z.string().min(1),
  target_schema_version: z.string().min(1),
  operator_options_json: z.record(z.string(), z.unknown()),
  operator_constraints_json: z.record(z.string(), z.unknown()),
  created_at: z.string().min(1),
});

export const proposalPassSchema = z.object({
  id: z.string().min(1),
  proposal_session_id: z.string().min(1),
  proposal_input_snapshot_id: z.string().min(1),
  pass_number: z.number().int().positive(),
  status: proposalPassStatusSchema,
  llm_request_json: z.record(z.string(), z.unknown()),
  llm_response_json: z.record(z.string(), z.unknown()),
  created_at: z.string().min(1),
  completed_at: z.string().min(1).nullable(),
});

export const proposalDraftStateSchema = z.object({
  id: z.string().min(1),
  proposal_session_id: z.string().min(1),
  proposal_input_snapshot_id: z.string().min(1),
  proposal_pass_id: z.string().min(1),
  target_artifact: z.string().min(1),
  status: proposalDraftStatusSchema,
  stale_reason: z.string().nullable(),
  current_proposal_record_id: z.string().min(1).nullable(),
});

export type ProposalSession = z.infer<typeof proposalSessionSchema>;
export type ProposalInputSnapshot = z.infer<typeof proposalInputSnapshotSchema>;
export type ProposalPass = z.infer<typeof proposalPassSchema>;
export type ProposalDraftState = z.infer<typeof proposalDraftStateSchema>;
