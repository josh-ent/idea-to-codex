import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";

import Database from "better-sqlite3";

import {
  abandonIntakeSession,
  continueIntakeSession,
  finalizeIntakeSession,
  getActiveIntakeSession,
  getIntakeSession,
  startIntakeSession,
  type IntakeSessionClient,
} from "../src/modules/intake/session-service.js";
import { IntakeError } from "../src/modules/intake/errors.js";
import { persistenceDatabasePath } from "../src/runtime/state-paths.js";
import { createFixtureRepo, type FixtureRepo } from "./helpers/repo-fixture.js";
import {
  createSequenceIntakeSessionClient,
  createStubIntakeSessionClient,
} from "./helpers/intake-session-stub.js";

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

function sessionOptions(repo: FixtureRepo) {
  return {
    stateDir: path.join(repo.rootDir, ".test-state"),
  };
}

function openStateDb(repo: FixtureRepo): Database.Database {
  return new Database(persistenceDatabasePath(sessionOptions(repo).stateDir), {
    readonly: true,
  });
}

describe("intake sessions", () => {
  it("creates one active session per scope and exposes it through the active-session lookup", async () => {
    const repo = track(await createFixtureRepo());
    const options = {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient(),
    };

    const created = await startIntakeSession(repo.rootDir, "Clarify the billing refresh.", options);
    expect(created.session.status).toBe("active");

    await expect(
      startIntakeSession(repo.rootDir, "Try to start a second session in the same scope.", options),
    ).rejects.toMatchObject({
      code: "active_intake_session_exists",
    } satisfies Partial<IntakeError>);

    const active = await getActiveIntakeSession(repo.rootDir, sessionOptions(repo));
    expect(active?.session.id).toBe(created.session.id);
    expect(active?.session.scope_fallback_mode).toBe("project_only");
    expect(active?.session.scope_key).toBe(repo.rootDir);
  });

  it("retains question identity and display id only through an explicit retain directive", async () => {
    const repo = track(await createFixtureRepo());
    const client = createStubIntakeSessionClient((input) => {
      const priorQuestionId = String(input.current_questions_json[0]?.id ?? "");

      if (input.phase === "initial") {
        return {
          brief_entries: [
            {
              entry_type: "problem_statement",
              text: "Clarify the release workflow brief.",
              provenance_type: "operator_provided",
              label: "Operator request",
            },
          ],
          question_directives: [
            {
              action: "create_new",
              prompt: "Who owns the release workflow today?",
              rationale_markdown: "We need the primary actor for the brief.",
              importance: "high",
              tags: ["stakeholders"],
            },
          ],
        };
      }

      return {
        brief_entries: [
          {
            entry_type: "elevator_pitch",
            text: "Improve the release workflow for the current release owner.",
            provenance_type: "llm_inferred",
            label: "Refined brief",
          },
        ],
        question_directives: [
          {
            action: "retain_existing",
            existing_question_id: priorQuestionId,
            prompt: "Who owns the release workflow today?",
            rationale_markdown: "The brief still depends on the workflow owner.",
            importance: "high",
            tags: ["stakeholders"],
          },
        ],
      };
    });

    const created = await startIntakeSession(repo.rootDir, "Clarify the release workflow brief.", {
      ...sessionOptions(repo),
      client,
    });
    const priorQuestion = created.questions[0];
    expect(priorQuestion?.display_id).toMatch(/^QUESTION-[0-9A-F]{8}$/);

    const continued = await continueIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      { [priorQuestion!.id]: "Release managers" },
      "Refine the brief.",
      {
        ...sessionOptions(repo),
        client,
      },
    );

    expect(continued.questions).toHaveLength(1);
    expect(continued.questions[0]?.id).toBe(priorQuestion?.id);
    expect(continued.questions[0]?.display_id).toBe(priorQuestion?.display_id);
    expect(continued.questions[0]?.answer_text).toBe("Release managers");
    expect(
      continued.question_lineage_summary.some(
        (entry) =>
          entry.from_question_id === priorQuestion?.id
          && entry.to_question_id === priorQuestion?.id
          && entry.relation_type === "retained_as",
      ),
    ).toBe(true);
  });

  it("rejects omitted live questions on continue", async () => {
    const repo = track(await createFixtureRepo());
    const client = createSequenceIntakeSessionClient([
      {
        brief_entries: [
          {
            entry_type: "problem_statement",
            text: "Clarify the operator brief.",
            provenance_type: "operator_provided",
            label: "Operator request",
          },
        ],
        question_directives: [
          {
            action: "create_new",
            prompt: "Which operator role is primary?",
            rationale_markdown: "Role clarity improves the brief.",
            importance: "medium",
            tags: ["stakeholders"],
          },
        ],
      },
      {
        brief_entries: [
          {
            entry_type: "recommendations",
            text: "Proceed with the initial operator-focused brief.",
            provenance_type: "llm_inferred",
            label: "Final recommendation",
          },
        ],
        question_directives: [],
      },
    ]);

    const created = await startIntakeSession(repo.rootDir, "Clarify the operator brief.", {
      ...sessionOptions(repo),
      client,
    });

    await expect(
      continueIntakeSession(
        repo.rootDir,
        created.session.id,
        created.session_revision,
        {},
        "Keep going without reconciling the question.",
        {
          ...sessionOptions(repo),
          client,
        },
      ),
    ).rejects.toMatchObject({
      code: "intake_question_mapping_invalid",
    } satisfies Partial<IntakeError>);
  });

  it("marks unanswered live questions as accepted_without_answer on finalization", async () => {
    const repo = track(await createFixtureRepo());
    const client = createSequenceIntakeSessionClient([
      {
        brief_entries: [
          {
            entry_type: "problem_statement",
            text: "Clarify the operator brief.",
            provenance_type: "operator_provided",
            label: "Operator request",
          },
        ],
        question_directives: [
          {
            action: "create_new",
            prompt: "Which operator role is primary?",
            rationale_markdown: "Role clarity improves the brief.",
            importance: "medium",
            tags: ["stakeholders"],
          },
        ],
      },
      {
        brief_entries: [
          {
            entry_type: "recommendations",
            text: "Proceed with the initial operator-focused brief.",
            provenance_type: "llm_inferred",
            label: "Final recommendation",
          },
        ],
        question_directives: [],
      },
    ]);

    const created = await startIntakeSession(repo.rootDir, "Clarify the operator brief.", {
      ...sessionOptions(repo),
      client,
    });

    const finalized = await finalizeIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      "This brief is good enough.",
      {
        ...sessionOptions(repo),
        client,
      },
    );

    expect(finalized.session.status).toBe("finalized");
    expect(finalized.current_brief?.status).toBe("final");
    expect(finalized.questions[0]?.status).toBe("accepted_without_answer");
    expect(
      finalized.question_lineage_summary.some(
        (entry) =>
          entry.from_question_id === finalized.questions[0]?.id
          && entry.relation_type === "accepted_without_answer_at_finalize",
      ),
    ).toBe(true);
  });

  it("rejects continue and re-finalize after finalization", async () => {
    const repo = track(await createFixtureRepo());
    const options = {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient(),
    };

    const created = await startIntakeSession(repo.rootDir, "Prepare a concise project brief.", options);
    const finalized = await finalizeIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      "Finalize now.",
      options,
    );

    await expect(
      continueIntakeSession(
        repo.rootDir,
        created.session.id,
        finalized.session_revision,
        {},
        "Try to continue.",
        options,
      ),
    ).rejects.toMatchObject({
      code: "intake_session_not_active",
    } satisfies Partial<IntakeError>);

    await expect(
      finalizeIntakeSession(
        repo.rootDir,
        created.session.id,
        finalized.session_revision,
        "Try to finalize again.",
        options,
      ),
    ).rejects.toMatchObject({
      code: "intake_session_not_active",
    } satisfies Partial<IntakeError>);
  });

  it("abandons active sessions and makes abandonment terminal", async () => {
    const repo = track(await createFixtureRepo());
    const options = {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient(),
    };
    const created = await startIntakeSession(repo.rootDir, "Prepare a concise project brief.", options);

    const abandoned = await abandonIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      options,
    );
    expect(abandoned.session.status).toBe("abandoned");

    await expect(
      continueIntakeSession(
        repo.rootDir,
        created.session.id,
        abandoned.session_revision,
        {},
        "Try to continue.",
        options,
      ),
    ).rejects.toMatchObject({
      code: "intake_session_not_active",
    } satisfies Partial<IntakeError>);
  });

  it("rejects cross-scope mutation by naked session id", async () => {
    const firstRepo = track(await createFixtureRepo());
    const secondRepo = track(await createFixtureRepo());
    const options = {
      ...sessionOptions(firstRepo),
      client: createStubIntakeSessionClient(),
    };

    const created = await startIntakeSession(firstRepo.rootDir, "Clarify the first repo brief.", options);

    await expect(
      continueIntakeSession(
        secondRepo.rootDir,
        created.session.id,
        created.session_revision,
        {},
        "Try to mutate across scope.",
        {
          ...sessionOptions(firstRepo),
          client: createStubIntakeSessionClient(),
        },
      ),
    ).rejects.toMatchObject({
      code: "intake_session_not_found",
    } satisfies Partial<IntakeError>);
  });

  it("removes the mutable session row when the initial hosted turn fails but keeps a failed turn audit row", async () => {
    const repo = track(await createFixtureRepo());
    const failingClient: IntakeSessionClient = {
      async generate() {
        throw new IntakeError("provider_unavailable", "simulated failure");
      },
    };

    await expect(
      startIntakeSession(repo.rootDir, "Clarify the billing refresh.", {
        ...sessionOptions(repo),
        client: failingClient,
      }),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
    } satisfies Partial<IntakeError>);

    const active = await getActiveIntakeSession(repo.rootDir, sessionOptions(repo));
    expect(active).toBeNull();

    const db = openStateDb(repo);

    try {
      const sessionCount = db
        .prepare("SELECT COUNT(*) AS value FROM intake_sessions")
        .get() as { value: number };
      const failedTurn = db
        .prepare("SELECT status, turn_kind, session_id FROM intake_turns LIMIT 1")
        .get() as { status: string; turn_kind: string; session_id: string } | undefined;

      expect(sessionCount.value).toBe(0);
      expect(failedTurn?.status).toBe("failed");
      expect(failedTurn?.turn_kind).toBe("initial");
      expect(typeof failedTurn?.session_id).toBe("string");
    } finally {
      db.close();
    }
  });

  it("exposes authoritative provenance on brief entries and questions", async () => {
    const repo = track(await createFixtureRepo());
    const created = await startIntakeSession(repo.rootDir, "Clarify the billing refresh.", {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient((input) => {
        if (input.phase === "initial") {
          return {
            brief_entries: [
              {
                entry_type: "problem_statement",
                text: "Clarify the billing refresh.",
                provenance_type: "operator_provided",
                label: "Operator request",
                detail: { request_text: "Clarify the billing refresh." },
              },
            ],
            question_directives: [
              {
                action: "create_new",
                prompt: "Which billing operator owns this flow?",
                rationale_markdown: "Ownership changes the brief.",
                importance: "high",
                tags: ["stakeholders"],
              },
            ],
          };
        }

        return {
          brief_entries: [],
          question_directives: [],
        };
      }),
    });

    expect(created.current_brief_entries[0]?.provenance_entries[0]).toMatchObject({
      provenance_type: "operator_provided",
      label: "Operator request",
      detail: { request_text: "Clarify the billing refresh." },
    });
    expect(created.questions[0]?.provenance_entries[0]).toMatchObject({
      provenance_type: "llm_inferred",
      label: "Question synthesized during intake",
    });

    const reloaded = await getIntakeSession(repo.rootDir, created.session.id, sessionOptions(repo));
    expect(reloaded.current_brief_entries[0]?.provenance_entries.length).toBeGreaterThan(0);
    expect(reloaded.questions[0]?.provenance_entries.length).toBeGreaterThan(0);
  });
});
