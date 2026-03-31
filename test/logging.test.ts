import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import path from "node:path";

import { configuredLogLevel, createLogger, withLogContext } from "../src/runtime/logging.js";
import { createApp } from "../src/server/app.js";
import {
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";

const repos: FixtureRepo[] = [];
const originalEnv = {
  IDEA_TO_CODEX_LOG_LEVEL: process.env.IDEA_TO_CODEX_LOG_LEVEL,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

beforeEach(() => {
  delete process.env.IDEA_TO_CODEX_LOG_LEVEL;
  delete process.env.LOG_LEVEL;
});

afterEach(async () => {
  if (originalEnv.IDEA_TO_CODEX_LOG_LEVEL === undefined) {
    delete process.env.IDEA_TO_CODEX_LOG_LEVEL;
  } else {
    process.env.IDEA_TO_CODEX_LOG_LEVEL = originalEnv.IDEA_TO_CODEX_LOG_LEVEL;
  }

  if (originalEnv.LOG_LEVEL === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
  }

  vi.restoreAllMocks();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

function captureStderr() {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      lines.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      return true;
    });

  return {
    joined() {
      return lines.join("");
    },
    spy,
  };
}

describe("runtime logging", () => {
  it("defaults to full verbosity outside production and test", () => {
    expect(configuredLogLevel({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("trace");
    expect(configuredLogLevel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("info");
    expect(configuredLogLevel({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("error");
    expect(
      configuredLogLevel({
        IDEA_TO_CODEX_LOG_LEVEL: "error",
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv),
    ).toBe("error");
  });

  it("writes contextual log lines to stderr", () => {
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const output = captureStderr();
    const logger = createLogger("test.logging");

    withLogContext({ request_id: "req-1234" }, () => {
      logger.info("context visible", { feature: "logging" });
    });

    expect(output.spy).toHaveBeenCalled();
    expect(output.joined()).toContain("INFO");
    expect(output.joined()).toContain("[test.logging]");
    expect(output.joined()).toContain("\"request_id\":\"req-1234\"");
    expect(output.joined()).toContain("\"feature\":\"logging\"");
  });

  it("logs request and backend service activity under the same request id", async () => {
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const output = captureStderr();
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createApp(repo.rootDir, {
      fallbackActiveProjectRoot: repo.rootDir,
      stateDir: path.join(repo.rootDir, ".test-state"),
    });

    const response = await request(app).get("/api/status");

    expect(response.status).toBe(200);

    const joined = output.joined();
    const requestIdMatch = joined.match(/"request_id":"([^"]+)"/);

    expect(requestIdMatch?.[1]).toBeTruthy();
    expect(joined).toContain("[server.request]");
    expect(joined).toContain("[projects]");
    expect(joined).toContain("[artifacts.repository]");
    expect(joined).toContain("[artifacts.git]");
    expect(joined).toContain(`"request_id":"${requestIdMatch![1]}"`);
  });
});
