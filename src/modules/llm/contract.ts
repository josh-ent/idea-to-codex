export const llmUsageProviders = ["openai", "codex"] as const;

export type LlmUsageProvider = (typeof llmUsageProviders)[number];

export interface LlmUsageRecord {
  id: number;
  occurred_at: string;
  provider: LlmUsageProvider;
  lane: string;
  operation: string;
  configured_model: string;
  resolved_model: string | null;
  project_root: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_log_event_id: number | null;
  response_log_event_id: number | null;
  metadata_json: string;
}

export interface LlmUsageRecordInput {
  provider: LlmUsageProvider;
  lane: string;
  operation: string;
  configured_model: string;
  resolved_model?: string | null;
  project_root: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_log_event_id?: number | null;
  response_log_event_id?: number | null;
  metadata?: Record<string, unknown>;
}

export interface LlmUsageQuery {
  provider?: LlmUsageProvider;
  project_root?: string;
}

export interface ProjectLlmUsageSummary {
  total_tokens: number;
  openai_tokens: number;
  codex_tokens: number;
}
