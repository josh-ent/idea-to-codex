import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import path from "node:path";

import { createApp, type ServerAppOptions } from "../src/server/app.js";
import { analyzeRequest } from "../src/modules/intake/service.js";
import {
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";
import {
  intakePromptVersion,
  intakeSchemaVersion,
  type IntakeAnalysis,
} from "../src/modules/intake/contract.js";
import { recordLlmUsage } from "../src/runtime/logging.js";
import { createStubIntakeClient } from "./helpers/intake-stub.js";

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

function cloneAnalysis(analysis: IntakeAnalysis): IntakeAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as IntakeAnalysis;
}

function createManagedProjectApp(repo: FixtureRepo) {
  return createApp(repo.rootDir, {
    stateDir: path.join(repo.rootDir, ".test-state"),
    fallbackActiveProjectRoot: repo.rootDir,
    intakeClient: createStubIntakeClient(),
  });
}

function createWorkspaceApp(repo: FixtureRepo, overrides: ServerAppOptions = {}) {
  return createApp(repo.rootDir, {
    stateDir: path.join(repo.rootDir, ".test-state"),
    intakeClient: createStubIntakeClient(),
    ...overrides,
  });
}

describe("server routes", () => {
  it("returns a health payload", async () => {
    const app = createApp(process.cwd());
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("bootstraps a minimal fixture repository", async () => {
    const repo = track(await createFixtureRepo());
    const app = createManagedProjectApp(repo);

    const response = await request(app).post("/api/bootstrap");

    expect(response.status).toBe(201);
    expect(response.body.created).toContain("README.md");
    expect(response.body.validation.rootFiles.every((file: { exists: boolean }) => file.exists)).toBe(
      true,
    );
  });

  it("rejects invalid package types with a 400", async () => {
    const app = createApp(process.cwd());
    const response = await request(app).post("/api/packages/not-a-type/TRANCHE-001");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error_code: "invalid_package_type",
      message: "type must be plan or execution",
      retryable: false,
    });
  });

  it("returns a 500 when package generation targets an unknown tranche", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app)
      .post("/api/packages/plan/TRANCHE-999")
      .send({ persist: false });

    expect(response.status).toBe(500);
    expect(response.body.message).toContain("Unknown tranche: TRANCHE-999");
  });

  it("refreshes and persists both package types through the api", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app)
      .post("/api/package-sets/TRANCHE-001/refresh")
      .send({ persist: true });

    expect(response.status).toBe(201);
    expect(response.body.tranche_id).toBe("TRANCHE-001");
    expect(response.body.packages.map((entry: { record: { type: string } }) => entry.record.type)).toEqual([
      "plan",
      "execution",
    ]);
  });

  it("returns a 500 when review generation targets an unknown tranche", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app)
      .post("/api/reviews/TRANCHE-999")
      .send({ persist: false });

    expect(response.status).toBe(500);
    expect(response.body.message).toContain("Unknown tranche: TRANCHE-999");
  });

  it("returns review payload guidance for missing package coverage", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app)
      .post("/api/reviews/TRANCHE-001")
      .send({ persist: false });

    expect(response.status).toBe(201);
    expect(response.body.record.missing_package_types).toEqual(["plan", "execution"]);
  });

  it("returns no active project until one is selected", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo);

    const response = await request(app).get("/api/status");

    expect(response.status).toBe(200);
    expect(response.body.project.active_project).toBeNull();
    expect(response.body.validation.tranches).toEqual([]);
  });

  it("creates and selects a new managed project", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo);

    const createResponse = await request(app).post("/api/projects/create").send({
      project_name: "Billing Console",
      project_path: "managed-projects/billing-console",
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.active_project.name).toBe("billing-console");
    expect(createResponse.body.active_project.is_git_repository).toBe(true);

    const statusResponse = await request(app).get("/api/status");

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.project.active_project.path).toContain("managed-projects/billing-console");
    expect(statusResponse.body.validation.rootFiles.every((file: { exists: boolean }) => file.exists)).toBe(
      true,
    );
    expect(statusResponse.body.repository_state.available).toBe(true);
    expect(statusResponse.body.repository_state.is_dirty).toBe(false);
  });

  it("opens an existing managed project", async () => {
    const studio = track(await createFixtureRepo());
    const managed = track(await createFixtureRepo());
    await seedValidRepository(managed);
    const app = createWorkspaceApp(studio);

    const response = await request(app).post("/api/projects/open").send({
      project_path: managed.rootDir,
    });

    expect(response.status).toBe(200);
    expect(response.body.active_project.path).toBe(managed.rootDir);

    const statusResponse = await request(app).get("/api/status");
    expect(statusResponse.body.project.active_project.path).toBe(managed.rootDir);
    expect(statusResponse.body.validation.tranches.length).toBeGreaterThan(0);
  });

  it("returns project-scoped llm usage totals in status", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    recordLlmUsage({
      configured_model: "gpt-5.2-chat-latest",
      input_tokens: 120,
      lane: "broad_reasoning",
      operation: "responses.parse",
      output_tokens: 30,
      project_root: repo.rootDir,
      provider: "openai",
      total_tokens: 150,
    });
    recordLlmUsage({
      configured_model: "codex-latest",
      input_tokens: 200,
      lane: "codex_execution",
      operation: "task.run",
      output_tokens: 40,
      project_root: repo.rootDir,
      provider: "codex",
      total_tokens: 240,
    });
    recordLlmUsage({
      configured_model: "gpt-5.2-chat-latest",
      input_tokens: 999,
      lane: "broad_reasoning",
      operation: "responses.parse",
      output_tokens: 1,
      project_root: "/other/project",
      provider: "openai",
      total_tokens: 1000,
    });

    const response = await request(app).get("/api/status");

    expect(response.status).toBe(200);
    expect(response.body.llm_usage).toEqual({
      total_tokens: 390,
      openai_tokens: 150,
      codex_tokens: 240,
    });
  });

  it("selects a project directory through the api", async () => {
    const repo = track(await createFixtureRepo());
    const selectedPath = path.join(repo.rootDir, "managed-projects", "billing-console");
    const app = createWorkspaceApp(repo, {
      selectDirectory: async () => selectedPath,
    });

    const response = await request(app).post("/api/projects/select-directory").send({
      initial_path: "managed-projects",
      dialog_title: "Select project folder",
    });

    expect(response.status).toBe(200);
    expect(response.body.path).toBe(selectedPath);
  });

  it("returns a null path when project directory selection is cancelled", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo, {
      selectDirectory: async () => null,
    });

    const response = await request(app).post("/api/projects/select-directory").send({});

    expect(response.status).toBe(200);
    expect(response.body.path).toBeNull();
  });

  it("rejects intake analysis when no active project is selected", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo);

    const response = await request(app).post("/api/intake/analyze").send({
      request: "Rename the glossary term.",
    });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("active_project_missing");
  });

  it("returns the empty/default intake analysis for missing or non-string request bodies", async () => {
    const repo = track(await createFixtureRepo());
    const app = createManagedProjectApp(repo);

    const missingResponse = await request(app).post("/api/intake/analyze").send({});
    expect(missingResponse.status).toBe(200);
    expect(missingResponse.body.summary).toBe("No request provided.");
    expect(missingResponse.body.material_questions[0]?.type).toBe("bounded_change");

    const nonStringResponse = await request(app)
      .post("/api/intake/analyze")
      .send({ request: 42 });
    expect(nonStringResponse.status).toBe(200);
    expect(nonStringResponse.body.summary).toBe("No request provided.");
    expect(nonStringResponse.body.material_questions[0]?.type).toBe("bounded_change");
  });

  it("returns the expanded workflow intake question set through the api", async () => {
    const repo = track(await createFixtureRepo());
    const app = createManagedProjectApp(repo);

    const response = await request(app).post("/api/intake/analyze").send({
      request: "Improve the operator UI workflow for release review.",
    });

    expect(response.status).toBe(200);
    expect(response.body.material_questions.map((question: { type: string }) => question.type)).toEqual([
      "workflow_actor",
      "workflow_use_case",
      "workflow_goal",
      "workflow_constraints",
    ]);
  });

  it("includes repository state in the status payload", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app).get("/api/status");

    expect(response.status).toBe(200);
    expect(response.body.project.active_project.path).toBe(repo.rootDir);
    expect(response.body.repository_state).toEqual({
      available: false,
      branch: null,
      head: null,
      dirty_paths: [],
      is_dirty: false,
      is_main_branch: false,
    });
  });

  it("creates and loads proposal sets through the api", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const createResponse = await request(app).post("/api/proposals/intake").send({
      request: "Tidy the current fixture output.",
      answers: {},
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.record.source_type).toBe("intake");

    const listResponse = await request(app).get("/api/proposals");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body[0]?.id).toBe(createResponse.body.id);

    const detailResponse = await request(app).get(`/api/proposals/${createResponse.body.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.drafts.length).toBeGreaterThan(0);
  });

  it("rejects intake proposal generation when blocking answers are missing", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app).post("/api/proposals/intake").send({
      request: "Rename the glossary term and change the backend architecture.",
      answers: {},
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      details: {
        question_ids: ["terminology_integrity", "architecture_direction"],
      },
      error_code: "blocking_questions_unanswered",
      message:
        "Unanswered blocking material questions: terminology_integrity, architecture_direction",
      retryable: false,
    });
  });

  it("returns unknown answer ids through the same structured error envelope", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app).post("/api/proposals/intake").send({
      request: "Tidy the current fixture output.",
      answers: {
        "Q-001": "This key should be rejected.",
      },
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      details: {
        question_ids: ["Q-001"],
      },
      error_code: "unknown_answer_ids",
      message: "Unknown material question ids: Q-001",
      retryable: false,
    });
  });

  it("returns schema and prompt mismatch codes through the public api", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);
    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(),
    });

    const schemaMismatch = cloneAnalysis(analysis);
    schemaMismatch.analysis_metadata.schema_version = intakeSchemaVersion + 1;
    const schemaResponse = await request(app).post("/api/proposals/intake").send({
      request: "Tidy the current fixture output.",
      answers: {},
      analysis: schemaMismatch,
    });

    expect(schemaResponse.status).toBe(409);
    expect(schemaResponse.body).toEqual({
      error_code: "analysis_schema_version_mismatch",
      message: "The supplied intake analysis uses an unsupported schema version.",
      retryable: false,
    });

    const promptMismatch = cloneAnalysis(analysis);
    promptMismatch.analysis_metadata.prompt_version = `${intakePromptVersion}-different`;
    const promptResponse = await request(app).post("/api/proposals/intake").send({
      request: "Tidy the current fixture output.",
      answers: {},
      analysis: promptMismatch,
    });

    expect(promptResponse.status).toBe(409);
    expect(promptResponse.body).toEqual({
      error_code: "analysis_prompt_version_mismatch",
      message: "The supplied intake analysis uses a different prompt version.",
      retryable: false,
    });
  });

  it("approves and rejects proposal drafts through the api", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);
    const createResponse = await request(app).post("/api/proposals/intake").send({
      request: "Tidy the current fixture output.",
      answers: {},
    });
    const backlogDraft = createResponse.body.drafts.find(
      (draft: { record: { target_artifact: string } }) =>
        draft.record.target_artifact === "BACKLOG.md",
    );
    const trancheDraft = createResponse.body.drafts.find(
      (draft: { record: { target_artifact: string } }) =>
        String(draft.record.target_artifact).startsWith("docs/tranches/"),
    );

    const approveResponse = await request(app).post(
      `/api/proposals/${backlogDraft.id}/approve`,
    );
    const rejectResponse = await request(app).post(
      `/api/proposals/${trancheDraft.id}/reject`,
    );

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.status).toBe("approved");
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.status).toBe("rejected");
  });

  it("returns a 500 for unknown proposal ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createManagedProjectApp(repo);

    const response = await request(app).post("/api/proposals/PROPOSAL-999-BACKLOG/approve");

    expect(response.status).toBe(500);
    expect(response.body.message).toContain("Unknown proposal draft");
  });

  it("serves the built operator console for non-api routes", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.write(
      "web/dist/index.html",
      "<!doctype html><html><body>operator console</body></html>",
    );
    const app = createManagedProjectApp(repo);

    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("operator console");
  });

  it("does not let the static fallback intercept unknown api routes", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.write(
      "web/dist/index.html",
      "<!doctype html><html><body>operator console</body></html>",
    );
    const app = createManagedProjectApp(repo);

    const response = await request(app).get("/api/not-found");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("operator console");
  });
});
