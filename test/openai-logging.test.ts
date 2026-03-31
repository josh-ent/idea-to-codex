import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const hoisted = vi.hoisted(() => ({
  constructorMock: vi.fn(),
  parseMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    readonly responses = {
      parse: hoisted.parseMock,
    };

    constructor(options: unknown) {
      hoisted.constructorMock(options);
    }
  },
}));

import {
  closeLogging,
  initializeLogging,
  listLlmUsageRecords,
  listLogEvents,
} from "../src/runtime/logging.js";
import { parseStructuredTextWithOpenAI } from "../src/modules/llm/openai.js";
import { createFixtureRepo, type FixtureRepo } from "./helpers/repo-fixture.js";

const repos: FixtureRepo[] = [];

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

function stateDirFor(repo: FixtureRepo): string {
  return path.join(repo.rootDir, ".test-state");
}

beforeEach(() => {
  hoisted.constructorMock.mockReset();
  hoisted.parseMock.mockReset();
  process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
});

afterEach(async () => {
  closeLogging();
  delete process.env.IDEA_TO_CODEX_LOG_LEVEL;
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

describe("OpenAI logging", () => {
  it("logs sanitized request and response payloads for structured text calls", async () => {
    const repo = track(await createFixtureRepo());
    initializeLogging({ stateDir: stateDirFor(repo) });

    hoisted.parseMock.mockResolvedValue({
      model: "gpt-5.2-2026-03-01",
      output: [],
      output_parsed: {
        summary: "done",
      },
      toJSON() {
        return {
          authorization: "Bearer secret",
          id: "resp_123",
          model: "gpt-5.2-2026-03-01",
          output: [],
          output_parsed: {
            summary: "done",
          },
        };
      },
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });

    const result = await parseStructuredTextWithOpenAI<{ summary: string }>({
      apiKey: "super-secret-api-key",
      canonicalProjectRoot: repo.rootDir,
      configuredModel: "gpt-5.2-chat-latest",
      instructions: "Return JSON only.",
      lane: "broad_reasoning",
      prompt: "Analyse this request fully.",
      responseFormat: {
        type: "json_schema",
      },
      timeoutMs: 4321,
    });

    expect(result.resolvedModel).toBe("gpt-5.2-2026-03-01");
    expect(result.parsed).toEqual({ summary: "done" });

    const events = listLogEvents({ scope: "llm.openai" }).events;
    expect(events).toHaveLength(2);

    const responseEvent = events.find((event) => event.message === "responses.parse response");
    const requestEvent = events.find((event) => event.message === "responses.parse request");

    expect(responseEvent).toBeTruthy();
    expect(requestEvent).toBeTruthy();

    const requestPayload = JSON.parse(requestEvent!.payload_json) as Record<string, unknown>;
    const responsePayload = JSON.parse(responseEvent!.payload_json) as Record<string, unknown>;
    const usageRecords = listLlmUsageRecords({
      project_root: repo.rootDir,
      provider: "openai",
    });

    expect(requestPayload.request_body).toEqual({
      input: "Analyse this request fully.",
      instructions: "Return JSON only.",
      model: "gpt-5.2-chat-latest",
      text: {
        format: {
          type: "json_schema",
        },
      },
    });
    expect(requestPayload.canonical_project_root).toBe(repo.rootDir);
    expect(requestEvent!.payload_json).not.toContain("super-secret-api-key");
    expect(responsePayload.request_log_event_id).toBe(requestEvent!.id);
    expect(responsePayload.usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    });
    expect(responsePayload.response_body).toEqual({
      authorization: "[REDACTED]",
      id: "resp_123",
      model: "gpt-5.2-2026-03-01",
      output: [],
      output_parsed: {
        summary: "done",
      },
    });
    expect(usageRecords).toHaveLength(1);
    expect(usageRecords[0]).toMatchObject({
      configured_model: "gpt-5.2-chat-latest",
      input_tokens: 10,
      lane: "broad_reasoning",
      operation: "responses.parse",
      output_tokens: 20,
      project_root: repo.rootDir,
      provider: "openai",
      request_log_event_id: requestEvent!.id,
      response_log_event_id: responseEvent!.id,
      total_tokens: 30,
    });
  });
});
