import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";

import {
  continueIntakeSession,
  finalizeIntakeSession,
  getActiveIntakeSession,
  getIntakeSession,
  startIntakeSession,
} from "../src/modules/intake/session-service.js";
import { IntakeError } from "../src/modules/intake/errors.js";
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

describe("intake sessions", () => {
  it("creates an intake session and exposes it as the active session for the scope", async () => {
    const repo = track(await createFixtureRepo());
    const created = await startIntakeSession(repo.rootDir, "Clarify the billing refresh.", {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient(),
    });

    expect(created.session.status).toBe("active");
    expect(created.request_text).toBe("Clarify the billing refresh.");
    expect(created.current_brief_entries.map((entry) => entry.entry_type)).toEqual([
      "problem_statement",
      "elevator_pitch",
    ]);

    const active = await getActiveIntakeSession(repo.rootDir, sessionOptions(repo));
    expect(active?.session.id).toBe(created.session.id);
  });

  it("retains question identity and carries answers forward across continue turns", async () => {
    const repo = track(await createFixtureRepo());
    const client = createStubIntakeSessionClient((input) => {
      const priorQuestionId = /ID: (QUESTION-[^\n]+)/.exec(input.current_questions_markdown)?.[1];

      if (input.phase === "initial") {
        return {
          brief_entries: [
            {
              entry_type: "problem_statement",
              rendered_markdown: "Clarify the release workflow brief.",
              value_text: "Clarify the release workflow brief.",
              provenance: [
                {
                  provenance_type: "operator_provided",
                  label: "Operator request",
                },
              ],
            },
          ],
          question_directives: [
            {
              directive: "create_new",
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
            rendered_markdown: "Improve the release workflow for the current release owner.",
            value_text: "Improve the release workflow for the current release owner.",
            provenance: [
              {
                provenance_type: "llm_inferred",
                label: "Refined brief",
              },
            ],
          },
        ],
        question_directives: priorQuestionId
          ? [
              {
                directive: "retain_existing",
                prior_question_id: priorQuestionId,
                prompt: "Who owns the release workflow today?",
                rationale_markdown: "The brief still depends on the workflow owner.",
                importance: "high",
                tags: ["stakeholders"],
                carry_forward_answer: true,
              },
            ]
          : [],
      };
    });

    const created = await startIntakeSession(repo.rootDir, "Clarify the release workflow brief.", {
      ...sessionOptions(repo),
      client,
    });
    const questionId = created.questions[0]?.id ?? "";

    const continued = await continueIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      { [questionId]: "Release managers" },
      "Refine the brief.",
      {
        ...sessionOptions(repo),
        client,
      },
    );

    expect(continued.session.status).toBe("active");
    expect(continued.questions).toHaveLength(1);
    expect(continued.questions[0]?.id).toBe(questionId);
    expect(continued.questions[0]?.answer_text).toBe("Release managers");
    expect(continued.questions[0]?.status).toBe("answered");
  });

  it("marks unanswered open questions as accepted_without_answer on finalization", async () => {
    const repo = track(await createFixtureRepo());
    const client = createSequenceIntakeSessionClient([
      {
        brief_entries: [
          {
            entry_type: "problem_statement",
            rendered_markdown: "Clarify the operator brief.",
            value_text: "Clarify the operator brief.",
            provenance: [
              {
                provenance_type: "operator_provided",
                label: "Operator request",
              },
            ],
          },
        ],
        question_directives: [
          {
            directive: "create_new",
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
            rendered_markdown: "Proceed with the initial operator-focused brief.",
            value_text: "Proceed with the initial operator-focused brief.",
            provenance: [
              {
                provenance_type: "llm_inferred",
                label: "Final recommendation",
              },
            ],
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

  it("rejects stale revision updates", async () => {
    const repo = track(await createFixtureRepo());
    const options = {
      ...sessionOptions(repo),
      client: createStubIntakeSessionClient(),
    };
    const created = await startIntakeSession(repo.rootDir, "Prepare a concise project brief.", options);

    await continueIntakeSession(
      repo.rootDir,
      created.session.id,
      created.session_revision,
      {},
      "Advance once.",
      options,
    );

    await expect(
      continueIntakeSession(
        repo.rootDir,
        created.session.id,
        created.session_revision,
        {},
        "Advance again with the stale revision.",
        options,
      ),
    ).rejects.toMatchObject({
      code: "intake_session_revision_conflict",
    } satisfies Partial<IntakeError>);

    const reloaded = await getIntakeSession(repo.rootDir, created.session.id, sessionOptions(repo));
    expect(reloaded.session.session_revision).toBeGreaterThan(created.session.session_revision);
  });
});
