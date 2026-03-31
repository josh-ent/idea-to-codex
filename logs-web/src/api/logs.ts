import type {
  LogEvent,
  LogEventLevel,
  LogEventListResponse,
} from "../../../src/modules/logs/contract.js";

export type { LogEvent, LogEventLevel, LogEventListResponse } from "../../../src/modules/logs/contract.js";

export interface LogFilters {
  from: string;
  level: string;
  project_root: string;
  q: string;
  request_id: string;
  scope: string;
  to: string;
}

export async function fetchLogEvents(
  filters: Partial<LogFilters> & { before_id?: number; limit?: number },
): Promise<LogEventListResponse> {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    query.set(
      key,
      key === "from" || key === "to" ? new Date(String(value)).toISOString() : String(value),
    );
  }

  const response = await fetch(`/api/logs/events?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`log events request failed with status ${response.status}`);
  }

  return (await response.json()) as LogEventListResponse;
}

export async function fetchLogEvent(eventId: number): Promise<LogEvent> {
  const response = await fetch(`/api/logs/events/${eventId}`);

  if (!response.ok) {
    throw new Error(`log event request failed with status ${response.status}`);
  }

  return (await response.json()) as LogEvent;
}

export function openLogStream(
  filters: Pick<LogFilters, "level" | "project_root" | "request_id" | "scope"> & {
    after_id?: number;
  },
): EventSource {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    query.set(key, String(value));
  }

  return new EventSource(`/api/logs/stream?${query.toString()}`);
}

export function levelClassName(level: LogEventLevel): string {
  return `level-badge level-badge--${level}`;
}
