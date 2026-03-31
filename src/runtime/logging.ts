import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type LogLevelName = "trace" | "debug" | "info" | "warn" | "error" | "silent";

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

const logLevelRank: Record<LogLevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 60,
};

const logContextStorage = new AsyncLocalStorage<LogContext>();

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
    if (!shouldLog(level)) {
      return;
    }

    const payload = {
      ...(logContextStorage.getStore() ?? {}),
      ...this.boundFields,
      ...(fields ?? {}),
    };
    const line = [
      new Date().toISOString(),
      level.toUpperCase().padEnd(5, " "),
      `[${this.scope}]`,
      message,
      formatFields(payload),
    ]
      .filter(Boolean)
      .join(" ");

    process.stderr.write(`${line}\n`);
  }
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

function formatFields(fields: LogFields): string {
  const visibleEntries = Object.entries(fields).filter(([, value]) => value !== undefined);

  if (visibleEntries.length === 0) {
    return "";
  }

  return JSON.stringify(
    Object.fromEntries(
      visibleEntries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, normalizeFieldValue(value)]),
    ),
  );
}

function normalizeFieldValue(value: unknown): unknown {
  if (value instanceof Error) {
    return summarizeError(value);
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
