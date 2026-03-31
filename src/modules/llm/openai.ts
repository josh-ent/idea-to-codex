import OpenAI from "openai";

export interface OpenAIStructuredTextRequest {
  apiKey: string;
  configuredModel: string;
  instructions: string;
  prompt: string;
  responseFormat: unknown;
  timeoutMs: number;
}

export interface OpenAIStructuredTextResult<Parsed> {
  parsed: Parsed | null;
  refusal: string | null;
  resolvedModel: string | null;
}

export async function parseStructuredTextWithOpenAI<Parsed>(
  request: OpenAIStructuredTextRequest,
): Promise<OpenAIStructuredTextResult<Parsed>> {
  const client = new OpenAI({
    apiKey: request.apiKey,
  });
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

  return {
    parsed: (response.output_parsed as Parsed | null) ?? null,
    refusal: extractRefusal(response.output),
    resolvedModel: typeof response.model === "string" ? response.model : null,
  };
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
