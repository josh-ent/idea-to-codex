import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import path from "node:path";
import Database from "better-sqlite3";

import {
  closeLogging,
  configuredLogFormat,
  configuredLogLevel,
  createLogger,
  initializeLogging,
  listLogEvents,
  withLogContext,
} from "../src/runtime/logging.js";
import { createApp } from "../src/server/app.js";
import {
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";

const repos: FixtureRepo[] = [];
const originalEnv = {
  IDEA_TO_CODEX_LOG_FORMAT: process.env.IDEA_TO_CODEX_LOG_FORMAT,
  IDEA_TO_CODEX_LOG_LEVEL: process.env.IDEA_TO_CODEX_LOG_LEVEL,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

beforeEach(() => {
  delete process.env.IDEA_TO_CODEX_LOG_FORMAT;
  delete process.env.IDEA_TO_CODEX_LOG_LEVEL;
  delete process.env.LOG_LEVEL;
});

afterEach(async () => {
  if (originalEnv.IDEA_TO_CODEX_LOG_FORMAT === undefined) {
    delete process.env.IDEA_TO_CODEX_LOG_FORMAT;
  } else {
    process.env.IDEA_TO_CODEX_LOG_FORMAT = originalEnv.IDEA_TO_CODEX_LOG_FORMAT;
  }

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

  closeLogging();
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
      lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    });

  return {
    joined() {
      return lines.join("");
    },
    spy,
  };
}

function setStderrTty(isTTY: boolean) {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

  Object.defineProperty(process.stderr, "isTTY", {
    configurable: true,
    value: isTTY,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(process.stderr, "isTTY", descriptor);
      return;
    }

    delete (process.stderr as { isTTY?: boolean }).isTTY;
  };
}

function stateDirFor(repo: FixtureRepo): string {
  return path.join(repo.rootDir, ".test-state");
}

describe("runtime logging", () => {
  it("defaults to full verbosity outside production and test", () => {
    expect(configuredLogLevel({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("trace");
    expect(configuredLogLevel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("info");
    expect(configuredLogLevel({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("error");
    expect(configuredLogFormat({ IDEA_TO_CODEX_LOG_FORMAT: "json" } as NodeJS.ProcessEnv)).toBe("json");
  });

  it("writes a readable contextual pretty log line to stderr", async () => {
    const repo = track(await createFixtureRepo());
    initializeLogging({ stateDir: stateDirFor(repo) });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const restoreTty = setStderrTty(false);
    const output = captureStderr();
    const logger = createLogger("test.logging");

    withLogContext({ request_id: "req-1234" }, () => {
      logger.info("context visible", { feature: "logging", root_dir: repo.rootDir });
    });

    restoreTty();

    expect(output.spy).toHaveBeenCalled();
    expect(output.joined()).toContain("INFO");
    expect(output.joined()).toContain("test.logging");
    expect(output.joined()).toContain("req-1234");
    expect(output.joined()).toContain('feature="logging"');
  });

  it("uses color only when stderr is a tty", async () => {
    const repo = track(await createFixtureRepo());
    initializeLogging({ stateDir: stateDirFor(repo) });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const logger = createLogger("test.color");

    let restoreTty = setStderrTty(true);
    let output = captureStderr();
    logger.warn("tty colors", { root_dir: repo.rootDir });
    restoreTty();

    expect(output.joined()).toContain("\u001b[");

    output.spy.mockRestore();
    output = captureStderr();
    output.spy.mockClear();
    const restorePlain = setStderrTty(false);
    logger.warn("plain output", { root_dir: repo.rootDir });
    restorePlain();

    expect(output.joined()).toContain("plain output");
    expect(output.joined()).not.toContain("\u001b[");
  });

  it("emits structured json lines when IDEA_TO_CODEX_LOG_FORMAT=json", async () => {
    const repo = track(await createFixtureRepo());
    initializeLogging({ stateDir: stateDirFor(repo) });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    process.env.IDEA_TO_CODEX_LOG_FORMAT = "json";
    const output = captureStderr();

    createLogger("test.json").error("json line", {
      feature: "logging",
      root_dir: repo.rootDir,
    });

    const parsed = JSON.parse(output.joined().trim()) as {
      level: string;
      message: string;
      payload: Record<string, unknown>;
      scope: string;
    };

    expect(parsed.level).toBe("error");
    expect(parsed.scope).toBe("test.json");
    expect(parsed.message).toBe("json line");
    expect(parsed.payload.feature).toBe("logging");
  });

  it("persists log events to SQLite and derives project_root by precedence", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";

    createLogger("test.sqlite").info("persist me", {
      active_project_path: "/active/project",
      canonical_project_root: "/canonical/project",
      feature: "logging",
      project_path: "/project/path",
      root_dir: repo.rootDir,
    });

    const db = new Database(path.join(stateDir, "studio.sqlite"), { readonly: true });
    const row = db
      .prepare(
        "SELECT scope, message, project_root, payload_json FROM log_events ORDER BY id DESC LIMIT 1",
      )
      .get() as {
      message: string;
      payload_json: string;
      project_root: string;
      scope: string;
    };
    db.close();

    expect(row.scope).toBe("test.sqlite");
    expect(row.message).toBe("persist me");
    expect(row.project_root).toBe("/canonical/project");
    expect(JSON.parse(row.payload_json).feature).toBe("logging");
  });

  it("searches persisted events across message and flattened payload text", async () => {
    const repo = track(await createFixtureRepo());
    initializeLogging({ stateDir: stateDirFor(repo) });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";

    createLogger("test.search").info("first message", {
      note: "contains the needle token",
      root_dir: repo.rootDir,
    });
    createLogger("test.search").info("second message", {
      note: "does not match",
      root_dir: repo.rootDir,
    });

    const results = listLogEvents({ q: "needle", scope: "test.search" });

    expect(results.events).toHaveLength(1);
    expect(results.events[0]?.message).toBe("first message");
  });

  it("serves log list and detail APIs from the same stored events", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    createLogger("test.api").info("queryable event", { root_dir: repo.rootDir });
    const app = createApp(repo.rootDir, { stateDir });

    const listResponse = await request(app).get("/api/logs/events").query({
      scope: "test.api",
      q: "queryable",
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.events).toHaveLength(1);

    const detailResponse = await request(app).get(
      `/api/logs/events/${listResponse.body.events[0].id}`,
    );

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.scope).toBe("test.api");
    expect(detailResponse.body.message).toBe("queryable event");
  });

  it("does not log requests made to the logging backend itself", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    createLogger("test.api").info("queryable event", { root_dir: repo.rootDir });
    const app = createApp(repo.rootDir, { stateDir });

    const listResponse = await request(app).get("/api/logs/events").query({
      scope: "test.api",
    });

    expect(listResponse.status).toBe(200);

    const detailResponse = await request(app).get(
      `/api/logs/events/${listResponse.body.events[0].id}`,
    );

    expect(detailResponse.status).toBe(200);
    expect(listLogEvents({ scope: "server.request" }).events).toHaveLength(0);
  });

  it("clears persisted log events through the log api", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    createLogger("test.clear").info("first event", { root_dir: repo.rootDir });
    createLogger("test.clear").info("second event", { root_dir: repo.rootDir });
    const app = createApp(repo.rootDir, { stateDir });

    const clearResponse = await request(app).delete("/api/logs/events");

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.cleared_count).toBe(2);
    expect(listLogEvents({ scope: "test.clear" }).events).toHaveLength(0);
    expect(listLogEvents({ scope: "server.request" }).events).toHaveLength(0);
  });

  it("streams appended events through the live log api with filters", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const app = createApp(repo.rootDir, { stateDir });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
    });
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/logs/stream?scope=test.stream&project_root=${encodeURIComponent(repo.rootDir)}`,
    );
    const reader = response.body?.getReader();

    if (!reader) {
      server.close();
      throw new Error("stream did not expose a reader");
    }

    createLogger("test.stream").info("ignored event", { root_dir: "/other/project" });
    createLogger("test.stream").info("streamed event", { root_dir: repo.rootDir });

    let chunk = "";

    while (!chunk.includes("streamed event")) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunk += Buffer.from(value).toString("utf8");
    }

    await reader.cancel();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(chunk).toContain("streamed event");
    expect(chunk).not.toContain("ignored event");
  });

  it("keeps request context visible across backend operations and in persisted logs", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    process.env.IDEA_TO_CODEX_LOG_LEVEL = "debug";
    const output = captureStderr();
    const app = createApp(repo.rootDir, {
      fallbackActiveProjectRoot: repo.rootDir,
      stateDir,
    });

    const response = await request(app).get("/api/status");

    expect(response.status).toBe(200);

    const joined = output.joined();
    const requestIdMatch = joined.match(/[a-f0-9-]{8}/);
    const persisted = listLogEvents({ scope: "server.request" }).events[0];

    expect(requestIdMatch?.[0]).toBeTruthy();
    expect(joined).toContain("server.request");
    expect(joined).toContain("projects");
    expect(joined).toContain("artifacts.repository");
    expect(joined).toContain("artifacts.git");
    expect(persisted?.request_id).toBeTruthy();
  });

  it("serves the operator console at / and the log viewer at /logs", async () => {
    const repo = track(await createFixtureRepo());
    const stateDir = stateDirFor(repo);
    initializeLogging({ stateDir });
    await repo.write(
      "web/dist/index.html",
      "<!doctype html><html><body>operator console</body></html>",
    );
    await repo.write(
      "logs-web/dist/index.html",
      "<!doctype html><html><body>log viewer</body></html>",
    );
    const app = createApp(repo.rootDir, { stateDir });

    const rootResponse = await request(app).get("/");
    const logsResponse = await request(app).get("/logs");

    expect(rootResponse.status).toBe(200);
    expect(rootResponse.text).toContain("operator console");
    expect(logsResponse.status).toBe(200);
    expect(logsResponse.text).toContain("log viewer");
  });
});
