import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import {
  logEventLevels,
  type LogEvent,
  type LogEventLevel,
  type LogEventListResponse,
  type LogEventQuery,
} from "../modules/logs/contract.js";
import { loggingDatabasePath } from "./state-paths.js";

export type LogLevelName = LogEventLevel | "silent";
export type LogFields = Record<string, unknown>;

interface LogContext extends LogFields {
  request_id?: string;
  request_method?: string;
  request_path?: string;
}

interface LogOperationOptions<Result> {
  startLevel?: LogLevelName;
  successLevel?: LogLevelName;
  errorLevel?: LogLevelName;
  fields?: LogFields;
  summarizeResult?: (result: Result) => LogFields | undefined;
}

interface LoggingOptions {
  stateDir?: string;
}

interface CanonicalLogEvent {
  occurred_at: string;
  level: LogEventLevel;
  scope: string;
  message: string;
  request_id: string | null;
  request_method: string | null;
  request_path: string | null;
  project_root: string | null;
  payload: LogFields;
  payload_json: string;
}

const logLevelRank: Record<LogLevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 60,
};

const logContextStorage = new AsyncLocalStorage<LogContext>();
const logScopeWidth = 28;
const logRequestWidth = 10;
const logProjectWidth = 28;
const logSuffixFieldLimit = 6;
let loggingBackend: LoggingBackend | null = null;

export function createLogger(scope: string, boundFields: LogFields = {}): Logger {
  return new Logger(scope, boundFields);
}

export function withLogContext<Result>(context: LogContext, run: () => Result): Result {
  return logContextStorage.run(
    {
      ...(logContextStorage.getStore() ?? {}),
      ...context,
    },
    run,
  );
}

export function generateRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function initializeLogging(options: LoggingOptions = {}): void {
  const dbPath = loggingDatabasePath(options.stateDir);

  if (loggingBackend?.dbPath === dbPath) {
    return;
  }

  loggingBackend?.close();
  loggingBackend = new LoggingBackend(dbPath);
}

export function closeLogging(): void {
  loggingBackend?.close();
  loggingBackend = null;
}

export function configuredLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevelName {
  const explicitLevel = env.IDEA_TO_CODEX_LOG_LEVEL ?? env.LOG_LEVEL;

  if (explicitLevel) {
    return normalizeLogLevel(explicitLevel);
  }

  if (env.NODE_ENV === "production") {
    return "info";
  }

  if (env.NODE_ENV === "test") {
    return "error";
  }

  return "trace";
}

export function configuredLogFormat(env: NodeJS.ProcessEnv = process.env): "pretty" | "json" {
  return env.IDEA_TO_CODEX_LOG_FORMAT?.trim().toLowerCase() === "json" ? "json" : "pretty";
}

export function summarizeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      error_message: error.message,
      error_name: error.name,
      error_stack:
        configuredLogLevel() === "trace" || configuredLogLevel() === "debug"
          ? error.stack
          : undefined,
    };
  }

  return {
    error_message: String(error),
  };
}

export async function logOperation<Result>(
  logger: Logger,
  operation: string,
  run: () => Promise<Result>,
  options: LogOperationOptions<Result> = {},
): Promise<Result> {
  const startedAt = Date.now();
  const startLevel = options.startLevel ?? "debug";
  const successLevel = options.successLevel ?? "info";
  const errorLevel = options.errorLevel ?? "error";

  logger.log(startLevel, `${operation} started`, options.fields);

  try {
    const result = await run();

    logger.log(successLevel, `${operation} completed`, {
      ...options.fields,
      duration_ms: Date.now() - startedAt,
      ...(options.summarizeResult?.(result) ?? {}),
    });

    return result;
  } catch (error) {
    logger.log(errorLevel, `${operation} failed`, {
      ...options.fields,
      duration_ms: Date.now() - startedAt,
      ...summarizeError(error),
    });
    throw error;
  }
}

export function listLogEvents(query: LogEventQuery = {}): LogEventListResponse {
  return getLoggingBackend().list(query);
}

export function getLogEvent(eventId: number): LogEvent | null {
  return getLoggingBackend().get(eventId);
}

export function subscribeToLogEvents(listener: (event: LogEvent) => void): () => void {
  return getLoggingBackend().subscribe(listener);
}

export class Logger {
  constructor(
    private readonly scope: string,
    private readonly boundFields: LogFields = {},
  ) {}

  child(scope: string, boundFields: LogFields = {}): Logger {
    return new Logger(`${this.scope}.${scope}`, {
      ...this.boundFields,
      ...boundFields,
    });
  }

  trace(message: string, fields?: LogFields): void {
    this.log("trace", message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    this.log("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log("error", message, fields);
  }

  log(level: LogLevelName, message: string, fields?: LogFields): void {
    if (level === "silent" || !shouldLog(level)) {
      return;
    }

    const payload = normalizeFields({
      ...(logContextStorage.getStore() ?? {}),
      ...this.boundFields,
      ...(fields ?? {}),
    });
    const event = toCanonicalEvent(level, this.scope, message, payload);

    try {
      const storedEvent = getLoggingBackend().append(event);
      writeLogLine(storedEvent, event.payload);
    } catch (error) {
      writeFallbackLogLine(event, error);
    }
  }
}

class LoggingBackend {
  readonly dbPath: string;

  private readonly db: Database.Database;
  private readonly listeners = new Set<(event: LogEvent) => void>();

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeSchema();
  }

  append(event: CanonicalLogEvent): LogEvent {
    const payloadText = flattenPayloadText(event.payload);
    const inserted = this.db
      .prepare(
        [
          "INSERT INTO log_events (",
          "  occurred_at,",
          "  level,",
          "  scope,",
          "  message,",
          "  request_id,",
          "  request_method,",
          "  request_path,",
          "  project_root,",
          "  payload_json,",
          "  payload_text",
          ") VALUES (",
          "  @occurred_at,",
          "  @level,",
          "  @scope,",
          "  @message,",
          "  @request_id,",
          "  @request_method,",
          "  @request_path,",
          "  @project_root,",
          "  @payload_json,",
          "  @payload_text",
          ")",
        ].join("\n"),
      )
      .run({
        ...event,
        payload_text: payloadText,
      });
    const storedEvent: LogEvent = {
      id: Number(inserted.lastInsertRowid),
      occurred_at: event.occurred_at,
      level: event.level,
      scope: event.scope,
      message: event.message,
      request_id: event.request_id,
      request_method: event.request_method,
      request_path: event.request_path,
      project_root: event.project_root,
      payload_json: event.payload_json,
    };

    this.db
      .prepare(
        [
          "INSERT INTO log_events_fts (",
          "  rowid, scope, message, request_id, request_path, project_root, payload_text",
          ") VALUES (",
          "  @rowid, @scope, @message, @request_id, @request_path, @project_root, @payload_text",
          ")",
        ].join("\n"),
      )
      .run({
        rowid: storedEvent.id,
        scope: storedEvent.scope,
        message: storedEvent.message,
        request_id: storedEvent.request_id ?? "",
        request_path: storedEvent.request_path ?? "",
        project_root: storedEvent.project_root ?? "",
        payload_text: payloadText,
      });

    for (const listener of this.listeners) {
      listener(storedEvent);
    }

    return storedEvent;
  }

  list(query: LogEventQuery): LogEventListResponse {
    const limit = normalizeLimit(query.limit);
    const listing = buildLogQuery(query, { includeBounds: true });
    const listSql = [
      "SELECT log_events.id, log_events.occurred_at, log_events.level, log_events.scope,",
      "  log_events.message, log_events.request_id, log_events.request_method,",
      "  log_events.request_path, log_events.project_root, log_events.payload_json",
      "FROM log_events",
      listing.joinClause,
      listing.whereClause,
      "ORDER BY log_events.id DESC",
      "LIMIT @limit",
    ]
      .filter(Boolean)
      .join("\n");
    const events = this.db
      .prepare(listSql)
      .all({
        ...listing.params,
        limit,
      })
      .map((row) => row as LogEvent);

    const latest = this.db
      .prepare(
        [
          "SELECT MAX(log_events.id) AS latest_id",
          "FROM log_events",
          ...buildLogQuery(query, { includeBounds: false }).sqlParts,
        ].join("\n"),
      )
      .get(buildLogQuery(query, { includeBounds: false }).params) as { latest_id: number | null };

    return {
      events,
      next_before_id: events.length === limit ? events[events.length - 1]?.id ?? null : null,
      latest_id: latest.latest_id ?? null,
    };
  }

  get(eventId: number): LogEvent | null {
    return (this.db
      .prepare(
        [
          "SELECT id, occurred_at, level, scope, message, request_id, request_method,",
          "  request_path, project_root, payload_json",
          "FROM log_events",
          "WHERE id = ?",
        ].join("\n"),
      )
      .get(eventId) as LogEvent | undefined) ?? null;
  }

  subscribe(listener: (event: LogEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.listeners.clear();
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec(
      [
        "CREATE TABLE IF NOT EXISTS log_events (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  occurred_at TEXT NOT NULL,",
        "  level TEXT NOT NULL,",
        "  scope TEXT NOT NULL,",
        "  message TEXT NOT NULL,",
        "  request_id TEXT,",
        "  request_method TEXT,",
        "  request_path TEXT,",
        "  project_root TEXT,",
        "  payload_json TEXT NOT NULL,",
        "  payload_text TEXT NOT NULL",
        ");",
        "CREATE VIRTUAL TABLE IF NOT EXISTS log_events_fts USING fts5(",
        "  scope,",
        "  message,",
        "  request_id,",
        "  request_path,",
        "  project_root,",
        "  payload_text",
        ");",
        "CREATE INDEX IF NOT EXISTS log_events_occurred_at_idx ON log_events (occurred_at);",
        "CREATE INDEX IF NOT EXISTS log_events_level_idx ON log_events (level);",
        "CREATE INDEX IF NOT EXISTS log_events_scope_idx ON log_events (scope);",
        "CREATE INDEX IF NOT EXISTS log_events_request_id_idx ON log_events (request_id);",
        "CREATE INDEX IF NOT EXISTS log_events_project_root_idx ON log_events (project_root);",
      ].join("\n"),
    );
  }
}

function getLoggingBackend(): LoggingBackend {
  if (!loggingBackend) {
    initializeLogging();
  }

  return loggingBackend!;
}

function shouldLog(level: LogLevelName): boolean {
  return logLevelRank[level] >= logLevelRank[configuredLogLevel()];
}

function normalizeLogLevel(rawLevel: string): LogLevelName {
  const normalized = rawLevel.trim().toLowerCase();

  if (normalized in logLevelRank) {
    return normalized as LogLevelName;
  }

  return "info";
}

function toCanonicalEvent(
  level: LogEventLevel,
  scope: string,
  message: string,
  payload: LogFields,
): CanonicalLogEvent {
  return {
    occurred_at: new Date().toISOString(),
    level,
    scope,
    message,
    request_id: typeof payload.request_id === "string" ? payload.request_id : null,
    request_method: typeof payload.request_method === "string" ? payload.request_method : null,
    request_path: typeof payload.request_path === "string" ? payload.request_path : null,
    project_root: deriveProjectRoot(payload),
    payload,
    payload_json: JSON.stringify(payload),
  };
}

function deriveProjectRoot(payload: LogFields): string | null {
  for (const key of [
    "canonical_project_root",
    "active_project_path",
    "project_path",
    "root_dir",
  ] as const) {
    const value = payload[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function normalizeFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizeFieldValue(value)]),
  );
}

function normalizeFieldValue(value: unknown): unknown {
  if (value instanceof Error) {
    return normalizeFields(summarizeError(value));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFieldValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeFieldValue(entry)]),
    );
  }

  if (typeof value === "string" && value.length > 400) {
    return `${value.slice(0, 397)}...`;
  }

  return value;
}

function flattenPayloadText(value: unknown): string {
  const fragments: string[] = [];
  appendPayloadFragments(value, fragments);
  return fragments.join(" ");
}

function appendPayloadFragments(value: unknown, fragments: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    fragments.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      appendPayloadFragments(entry, fragments);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      fragments.push(key);
      appendPayloadFragments(entry, fragments);
    }
  }
}

function buildLogQuery(
  query: LogEventQuery,
  options: { includeBounds: boolean },
): {
  joinClause: string;
  whereClause: string;
  params: Record<string, unknown>;
  sqlParts: string[];
} {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  let joinClause = "";

  if (query.q?.trim()) {
    joinClause = "INNER JOIN log_events_fts ON log_events_fts.rowid = log_events.id";
    clauses.push("log_events_fts MATCH @fts_query");
    params.fts_query = toFtsQuery(query.q);
  }

  if (query.level) {
    clauses.push("log_events.level = @level");
    params.level = query.level;
  }

  if (query.scope?.trim()) {
    clauses.push("log_events.scope = @scope");
    params.scope = query.scope.trim();
  }

  if (query.request_id?.trim()) {
    clauses.push("log_events.request_id = @request_id");
    params.request_id = query.request_id.trim();
  }

  if (query.project_root?.trim()) {
    clauses.push("log_events.project_root = @project_root");
    params.project_root = query.project_root.trim();
  }

  if (query.from?.trim()) {
    clauses.push("log_events.occurred_at >= @from");
    params.from = query.from.trim();
  }

  if (query.to?.trim()) {
    clauses.push("log_events.occurred_at <= @to");
    params.to = query.to.trim();
  }

  if (options.includeBounds && typeof query.before_id === "number") {
    clauses.push("log_events.id < @before_id");
    params.before_id = query.before_id;
  }

  if (options.includeBounds && typeof query.after_id === "number") {
    clauses.push("log_events.id > @after_id");
    params.after_id = query.after_id;
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  return {
    joinClause,
    whereClause,
    params,
    sqlParts: [joinClause, whereClause].filter(Boolean),
  };
}

function toFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, "\"\"")}"`)
    .join(" ");
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 200;
  }

  return Math.max(1, Math.min(500, Math.trunc(value!)));
}

function writeLogLine(event: LogEvent, payload: LogFields): void {
  if (configuredLogFormat() === "json") {
    process.stderr.write(`${JSON.stringify({ ...event, payload })}\n`);
    return;
  }

  const levelLabel = padCell(event.level.toUpperCase(), 5);
  const timestamp = event.occurred_at;
  const scope = padCell(event.scope, logScopeWidth);
  const requestId = padCell(event.request_id ?? "-", logRequestWidth);
  const projectRoot = padCell(event.project_root ?? "-", logProjectWidth);
  const suffix = formatPayloadSuffix(payload);
  const stack = readStackTrace(payload);
  const line = [
    timestamp,
    formatLevelBadge(levelLabel, event.level),
    scope,
    requestId,
    projectRoot,
    event.message,
    suffix,
  ]
    .filter(Boolean)
    .join("  ");

  process.stderr.write(`${line}\n`);

  if (stack) {
    process.stderr.write(`${indentBlock(stack, "  ")}\n`);
  }
}

function writeFallbackLogLine(event: CanonicalLogEvent, error: unknown): void {
  const fallback = {
    occurred_at: event.occurred_at,
    level: event.level,
    scope: event.scope,
    message: event.message,
    request_id: event.request_id,
    project_root: event.project_root,
    payload: event.payload,
    logging_backend_error: summarizeError(error),
  };
  process.stderr.write(`${JSON.stringify(fallback)}\n`);
}

function formatLevelBadge(levelLabel: string, level: LogEventLevel): string {
  if (!process.stderr.isTTY) {
    return levelLabel;
  }

  const [open, close] = levelColors[level];
  return `${open}${levelLabel}${close}`;
}

function formatPayloadSuffix(payload: LogFields): string {
  const visibleEntries = Object.entries(payload).filter(
    ([key, value]) =>
      value !== undefined &&
      ![
        "request_id",
        "request_method",
        "request_path",
        "canonical_project_root",
        "active_project_path",
        "project_path",
        "root_dir",
        "error_stack",
      ].includes(key),
  );

  return visibleEntries
    .slice(0, logSuffixFieldLimit)
    .map(([key, value]) => `${key}=${compactFieldValue(value)}`)
    .join(" ");
}

function compactFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function readStackTrace(payload: LogFields): string {
  return typeof payload.error_stack === "string" ? payload.error_stack : "";
}

function padCell(value: string, width: number): string {
  if (value.length === width) {
    return value;
  }

  if (value.length < width) {
    return value.padEnd(width, " ");
  }

  if (width <= 3) {
    return value.slice(0, width);
  }

  const available = width - 1;
  const prefixLength = Math.ceil(available / 2);
  const suffixLength = Math.floor(available / 2);
  return `${value.slice(0, prefixLength)}…${value.slice(value.length - suffixLength)}`;
}

function indentBlock(value: string, indent: string): string {
  return value
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

const levelColors: Record<LogEventLevel, [string, string]> = {
  trace: ["\u001b[38;5;244m", "\u001b[0m"],
  debug: ["\u001b[36m", "\u001b[0m"],
  info: ["\u001b[32m", "\u001b[0m"],
  warn: ["\u001b[33m", "\u001b[0m"],
  error: ["\u001b[31m", "\u001b[0m"],
};
