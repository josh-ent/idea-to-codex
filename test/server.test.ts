import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import path from "node:path";

import { createApp, type ServerAppOptions } from "../src/server/app.js";
import {
  buildProposalDraftRecord,
  buildProposalSetRecord,
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";
import { recordLlmUsage } from "../src/runtime/logging.js";
import { createStubIntakeSessionClient } from "./helpers/intake-session-stub.js";

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

function createManagedProjectApp(repo: FixtureRepo) {
  return createApp(repo.rootDir, {
    stateDir: path.join(repo.rootDir, ".test-state"),
    fallbackActiveProjectRoot: repo.rootDir,
    intakeSessionClient: createStubIntakeSessionClient(),
  });
}

function createWorkspaceApp(repo: FixtureRepo, overrides: ServerAppOptions = {}) {
  return createApp(repo.rootDir, {
    stateDir: path.join(repo.rootDir, ".test-state"),
    intakeSessionClient: createStubIntakeSessionClient(),
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

  it("rejects intake session creation when no active project is selected", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo);

    const response = await request(app).post("/api/intake/sessions").send({
      request_text: "Rename the glossary term.",
    });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("active_project_missing");
  });

  it("creates and reloads an intake session through the api", async () => {
    const repo = track(await createFixtureRepo());
    const app = createManagedProjectApp(repo);

    const createResponse = await request(app).post("/api/intake/sessions").send({
      request_text: "Clarify the billing control-room refresh.",
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.session.status).toBe("active");
    expect(createResponse.body.request_text).toBe("Clarify the billing control-room refresh.");
    expect(createResponse.body.current_brief_entries[0]?.entry_type).toBe("problem_statement");

    const activeResponse = await request(app).get("/api/intake/active");
    expect(activeResponse.status).toBe(200);
    expect(activeResponse.body.session.id).toBe(createResponse.body.session.id);

    const detailResponse = await request(app).get(
      `/api/intake/sessions/${createResponse.body.session.id}`,
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.request_text).toBe("Clarify the billing control-room refresh.");
  });

  it("continues and finalizes intake sessions through the api", async () => {
    const repo = track(await createFixtureRepo());
    const app = createWorkspaceApp(repo, {
      fallbackActiveProjectRoot: repo.rootDir,
      intakeSessionClient: createStubIntakeSessionClient((input) => {
        const priorQuestionId = String(input.current_questions_json[0]?.id ?? "");

        if (input.phase === "initial") {
          return {
            brief_entries: [
              {
                entry_type: "problem_statement",
                text: "Tighten the release brief.",
                provenance_type: "operator_provided",
                label: "Operator request",
              },
            ],
            question_directives: [
              {
                action: "create_new",
                prompt: "Who is the primary operator for this release workflow?",
                rationale_markdown: "Actor clarity changes the brief.",
                importance: "high",
                tags: ["stakeholders"],
              },
            ],
          };
        }

        if (input.phase === "continue") {
          return {
            brief_entries: [
              {
                entry_type: "elevator_pitch",
                text: "Refine the release workflow for the primary operator.",
                provenance_type: "llm_inferred",
                label: "Refined brief",
              },
            ],
            question_directives: priorQuestionId
              ? [
                  {
                    action: "retain_existing",
                    existing_question_id: priorQuestionId,
                    prompt: "Who is the primary operator for this release workflow?",
                    rationale_markdown: "Still needed for the brief.",
                    importance: "high",
                    tags: ["stakeholders"],
                  },
                ]
              : [],
          };
        }

        const finalQuestionId = String(input.current_questions_json[0]?.id ?? "");

        return {
          brief_entries: [
            {
              entry_type: "recommendations",
              text: "Proceed with the clarified operator-facing workflow brief.",
              provenance_type: "llm_inferred",
              label: "Final recommendation",
            },
          ],
          question_directives: [
            {
              action: "retain_existing",
              existing_question_id: finalQuestionId,
              prompt: "Who is the primary operator for this release workflow?",
              rationale_markdown: "The finalized brief still names the primary operator.",
              importance: "high",
              tags: ["stakeholders"],
            },
          ],
        };
      }),
    });

    const createResponse = await request(app).post("/api/intake/sessions").send({
      request_text: "Clarify the release workflow brief.",
    });
    expect(createResponse.status).toBe(201);

    const questionId = createResponse.body.questions[0]?.id;
    expect(questionId).toBeTruthy();

    const continueResponse = await request(app)
      .post(`/api/intake/sessions/${createResponse.body.session.id}/continue`)
      .send({
        expected_session_revision: createResponse.body.session_revision,
        operator_notes: "Keep going.",
        question_answers: {
          [questionId]: "Release managers",
        },
      });

    expect(continueResponse.status).toBe(200);
    expect(continueResponse.body.session.status).toBe("active");
    expect(continueResponse.body.questions[0]?.answer_text).toBe("Release managers");

    const finalizeResponse = await request(app)
      .post(`/api/intake/sessions/${createResponse.body.session.id}/finalize`)
      .send({
        expected_session_revision: continueResponse.body.session_revision,
        finalize_note: "This brief is strong enough. Finalize it.",
      });

    expect(finalizeResponse.status).toBe(200);
    expect(finalizeResponse.body.session.status).toBe("finalized");
    expect(finalizeResponse.body.current_brief.status).toBe("final");
  });

  it("rejects continued intake after finalization", async () => {
    const repo = track(await createFixtureRepo());
    const app = createManagedProjectApp(repo);
    const createResponse = await request(app).post("/api/intake/sessions").send({
      request_text: "Prepare a brief.",
    });
    const finalizeResponse = await request(app)
      .post(`/api/intake/sessions/${createResponse.body.session.id}/finalize`)
      .send({
        expected_session_revision: createResponse.body.session_revision,
        finalize_note: "Finalize now.",
      });

    expect(finalizeResponse.status).toBe(200);

    const continueResponse = await request(app)
      .post(`/api/intake/sessions/${createResponse.body.session.id}/continue`)
      .send({
        expected_session_revision: finalizeResponse.body.session_revision,
        operator_notes: "Try to continue anyway.",
      });

    expect(continueResponse.status).toBe(409);
    expect(continueResponse.body.error_code).toBe("intake_session_not_active");
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

  it("approves and rejects proposal drafts through the api", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord(),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-BACKLOG",
            proposalSetId: "PROPOSAL-001",
            targetArtifact: "BACKLOG.md",
            proposedContent: "# Backlog\n\n- [ ] Reviewed change.\n",
          }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/assumptions.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-ASSUMPTIONS",
            proposalSetId: "PROPOSAL-001",
            targetArtifact: "ASSUMPTIONS.md",
            proposedContent: "# Assumptions\n\n## Active assumptions\n\n- `A-001`: Fixture assumption one.\n",
          }),
        },
      ],
    });
    const app = createManagedProjectApp(repo);

    const approveResponse = await request(app).post(
      "/api/proposals/PROPOSAL-001-BACKLOG/approve",
    );
    const rejectResponse = await request(app).post(
      "/api/proposals/PROPOSAL-001-ASSUMPTIONS/reject",
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
