import {
  getLogEvent,
  listLogEvents,
} from "../../runtime/logging.js";
import {
  logEventLevels,
  type LogEvent,
  type LogEventLevel,
  type LogEventListResponse,
  type LogEventQuery,
} from "./contract.js";

export interface LiveLogEventQuery {
  after_id?: number;
  level?: LogEventLevel;
  scope?: string;
  request_id?: string;
  project_root?: string;
}

export function queryLogEvents(input: Record<string, unknown>): LogEventListResponse {
  return listLogEvents(parseLogEventQuery(input));
}

export function readLogEvent(eventId: number): LogEvent | null {
  return getLogEvent(eventId);
}

export function parseLogEventQuery(input: Record<string, unknown>): LogEventQuery {
  return {
    limit: parseOptionalNumber(input.limit),
    before_id: parseOptionalNumber(input.before_id),
    after_id: parseOptionalNumber(input.after_id),
    level: parseLogEventLevel(input.level),
    scope: parseOptionalString(input.scope),
    request_id: parseOptionalString(input.request_id),
    project_root: parseOptionalString(input.project_root),
    from: parseOptionalString(input.from),
    to: parseOptionalString(input.to),
    q: parseOptionalString(input.q),
  };
}

export function parseLiveLogEventQuery(input: Record<string, unknown>): LiveLogEventQuery {
  return {
    after_id: parseOptionalNumber(input.after_id),
    level: parseLogEventLevel(input.level),
    scope: parseOptionalString(input.scope),
    request_id: parseOptionalString(input.request_id),
    project_root: parseOptionalString(input.project_root),
  };
}

export function matchesLiveLogEventQuery(event: LogEvent, query: LiveLogEventQuery): boolean {
  return (
    (query.after_id === undefined || event.id > query.after_id) &&
    (query.level === undefined || event.level === query.level) &&
    (query.scope === undefined || event.scope === query.scope) &&
    (query.request_id === undefined || event.request_id === query.request_id) &&
    (query.project_root === undefined || event.project_root === query.project_root)
  );
}

function parseOptionalNumber(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string" && typeof raw !== "number") {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function parseLogEventLevel(value: unknown): LogEventLevel | undefined {
  const raw = parseOptionalString(value);

  if (!raw) {
    return undefined;
  }

  if ((logEventLevels as readonly string[]).includes(raw)) {
    return raw as LogEventLevel;
  }

  return undefined;
}
