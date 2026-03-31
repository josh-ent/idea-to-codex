export const logEventLevels = ["trace", "debug", "info", "warn", "error"] as const;

export type LogEventLevel = (typeof logEventLevels)[number];

export interface LogEvent {
  id: number;
  occurred_at: string;
  level: LogEventLevel;
  scope: string;
  message: string;
  request_id: string | null;
  request_method: string | null;
  request_path: string | null;
  project_root: string | null;
  payload_json: string;
}

export interface LogEventQuery {
  limit?: number;
  before_id?: number;
  after_id?: number;
  level?: LogEventLevel;
  scope?: string;
  request_id?: string;
  project_root?: string;
  from?: string;
  to?: string;
  q?: string;
}

export interface LogEventListResponse {
  events: LogEvent[];
  next_before_id: number | null;
  latest_id: number | null;
}
