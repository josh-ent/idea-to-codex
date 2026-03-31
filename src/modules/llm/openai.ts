import OpenAI from "openai";

import { createLogger, recordLlmUsage, summarizeError } from "../../runtime/logging.js";
import type { LlmUsageProvider } from "./contract.js";

export interface OpenAIStructuredTextRequest {
  apiKey: string;
  canonicalProjectRoot: string;
  configuredModel: string;
  instructions: string;
  lane: string;
  prompt: string;
  responseFormat: unknown;
  timeoutMs: number;
}

export interface OpenAIStructuredTextResult<Parsed> {
  parsed: Parsed | null;
  refusal: string | null;
  resolvedModel: string | null;
}

const logger = createLogger("llm.openai");
const openAiProvider: LlmUsageProvider = "openai";
const sensitiveFieldPattern = /(api[-_]?key|authorization|secret|token|password|cookie)/i;

export async function parseStructuredTextWithOpenAI<Parsed>(
  request: OpenAIStructuredTextRequest,
): Promise<OpenAIStructuredTextResult<Parsed>> {
  const client = new OpenAI({
    apiKey: request.apiKey,
  });

  const requestEvent = logger.info("responses.parse request", {
    canonical_project_root: request.canonicalProjectRoot,
    configured_model: request.configuredModel,
    lane: request.lane,
    llm_direction: "request",
    llm_operation: "responses.parse",
    llm_provider: openAiProvider,
    request_body: sanitizeForLog({
      input: request.prompt,
      instructions: request.instructions,
      model: request.configuredModel,
      text: {
        format: request.responseFormat,
      },
    }),
    timeout_ms: request.timeoutMs,
  });

  try {
    const response = await client.responses.parse(
      {
        model: request.configuredModel,
        instructions: request.instructions,
        input: request.prompt,
        text: {
          format: request.responseFormat as never,
        },
      },
      {
        timeout: request.timeoutMs,
      },
    );

    const usage = readUsage(response);
    const responseEvent = logger.info("responses.parse response", {
      canonical_project_root: request.canonicalProjectRoot,
      configured_model: request.configuredModel,
      lane: request.lane,
      llm_direction: "response",
      llm_operation: "responses.parse",
      llm_provider: openAiProvider,
      request_log_event_id: requestEvent?.id,
      resolved_model: typeof response.model === "string" ? response.model : null,
      response_body: sanitizeForLog(response),
      usage,
      timeout_ms: request.timeoutMs,
    });

    if (usage) {
      recordLlmUsage({
        configured_model: request.configuredModel,
        input_tokens: usage.input_tokens,
        lane: request.lane,
        metadata: {
          usage,
        },
        operation: "responses.parse",
        output_tokens: usage.output_tokens,
        project_root: request.canonicalProjectRoot,
        provider: openAiProvider,
        request_log_event_id: requestEvent?.id,
        resolved_model: typeof response.model === "string" ? response.model : null,
        response_log_event_id: responseEvent?.id ?? null,
        total_tokens: usage.total_tokens,
      });
    }

    return {
      parsed: (response.output_parsed as Parsed | null) ?? null,
      refusal: extractRefusal(response.output),
      resolvedModel: typeof response.model === "string" ? response.model : null,
    };
  } catch (error) {
    logger.error("responses.parse failed", {
      canonical_project_root: request.canonicalProjectRoot,
      configured_model: request.configuredModel,
      ...summarizeError(error),
      error_response: sanitizeForLog(error),
      lane: request.lane,
      llm_direction: "error",
      llm_operation: "responses.parse",
      llm_provider: openAiProvider,
      request_log_event_id: requestEvent?.id,
      timeout_ms: request.timeoutMs,
    });
    throw error;
  }
}

function readUsage(response: unknown): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
} | null {
  if (!response || typeof response !== "object" || !("usage" in response)) {
    return null;
  }

  const usage = (response as { usage?: unknown }).usage;

  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = readOptionalInteger((usage as Record<string, unknown>).input_tokens);
  const outputTokens = readOptionalInteger((usage as Record<string, unknown>).output_tokens);
  const totalTokens =
    readOptionalInteger((usage as Record<string, unknown>).total_tokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}

function readOptionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function extractRefusal(output: unknown[]): string | null {
  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content &&
        typeof content === "object" &&
        "type" in content &&
        content.type === "refusal" &&
        "refusal" in content &&
        typeof content.refusal === "string"
      ) {
        return content.refusal;
      }
    }
  }

  return null;
}

function sanitizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeForLog(
      {
        ...Object.fromEntries(Object.entries(value)),
        name: value.name,
        message: value.message,
        stack: value.stack,
      },
      seen,
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLog(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    const serializable =
      typeof (value as { toJSON?: () => unknown }).toJSON === "function"
        ? (value as { toJSON: () => unknown }).toJSON()
        : value;

    if (serializable !== value) {
      return sanitizeForLog(serializable, seen);
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          sensitiveFieldPattern.test(key) ? "[REDACTED]" : sanitizeForLog(entry, seen),
        ]),
    );
  }

  return String(value);
}
