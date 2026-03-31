import { afterEach, describe, expect, it } from "vitest";

import {
  analyzeRequest,
  resolveIntakeAnalysis,
  type IntakeModelOutput,
} from "../src/modules/intake/service.js";
import { createFixtureRepo, type FixtureRepo } from "./helpers/repo-fixture.js";
import { createStubIntakeClient } from "./helpers/intake-stub.js";

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

describe("intake analysis", () => {
  it.each([
    {
      request: "Rename the glossary term and align wording across the repo.",
      expectedType: "terminology_integrity",
      blocking: true,
    },
    {
      request: "Define the schema field meaning in the data dictionary.",
      expectedType: "data_definition_integrity",
      blocking: true,
    },
    {
      request: "Change the backend module architecture and API ownership.",
      expectedType: "architecture_direction",
      blocking: true,
    },
    {
      request: "Clarify the governance and approval constraint for this workflow.",
      expectedType: "governance_posture",
      blocking: true,
    },
    {
      request: "Make the Codex execution package more explicit.",
      expectedType: "handoff_quality",
      blocking: false,
    },
  ])("returns the $expectedType question through the canonical pipeline", async ({ request, expectedType, blocking }) => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, request, {
      client: createStubIntakeClient(),
    });
    const question = analysis.material_questions.find((entry) => entry.type === expectedType);

    expect(question).toBeDefined();
    expect(question?.blocking).toBe(blocking);
    expect(question?.id).toBe(expectedType);
  });

  it("expands workflow intake into the full workflow quartet and keeps display ordering separate from identity", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Improve the operator UI workflow for release review.", {
      client: createStubIntakeClient(),
    });

    expect(analysis.material_questions.map((question) => question.id)).toEqual([
      "workflow_actor",
      "workflow_use_case",
      "workflow_goal",
      "workflow_constraints",
    ]);
    expect(analysis.material_questions.map((question) => question.display_id)).toEqual([
      "Q-001",
      "Q-002",
      "Q-003",
      "Q-004",
    ]);
  });

  it("returns bounded_change when no specific question type applies", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(),
    });

    expect(analysis.material_questions).toHaveLength(1);
    expect(analysis.material_questions[0]).toMatchObject({
      id: "bounded_change",
      display_id: "Q-001",
      type: "bounded_change",
      blocking: false,
    });
    expect(analysis.draft_assumptions).toEqual([
      "Proceed under the current architecture and glossary unless the request explicitly changes them.",
    ]);
  });

  it("uses hashes for normalized and truncated prompt-used context, not raw bytes", async () => {
    const repo = track(
      await createFixtureRepo({
        projectAimsContent: "# PROJECT AIMS\r\n\r\nFixture project aims.\r\n",
      }),
    );
    const client = createStubIntakeClient();

    const baseline = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client,
    });

    await repo.write("PROJECT_AIMS.md", "# PROJECT AIMS\n\nFixture project aims.\n");
    const normalizedEquivalent = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client,
    });

    expect(normalizedEquivalent.analysis_metadata.context_hash).toBe(
      baseline.analysis_metadata.context_hash,
    );

    await repo.write("PROJECT_AIMS.md", `${"A".repeat(9000)}\nTRUNCATED TAIL`);
    const truncated = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client,
    });
    await repo.write("PROJECT_AIMS.md", `${"A".repeat(9000)}\nDIFFERENT TAIL`);
    const withDifferentTail = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client,
    });

    expect(truncated.analysis_metadata.context_truncated).toBe(true);
    expect(truncated.analysis_metadata.context_hash).toBe(
      withDifferentTail.analysis_metadata.context_hash,
    );
  });

  it("rejects duplicate question types before producing the canonical contract", async () => {
    const repo = track(await createFixtureRepo());

    await expect(
      analyzeRequest(repo.rootDir, "Any request", {
        client: createStubIntakeClient(() => ({
          summary: "Any request",
          recommended_tranche_title: "Any Request",
          affected_artifacts: [],
          affected_modules: [],
          question_types: ["terminology_integrity", "terminology_integrity"],
          draft_assumptions: [],
        })),
      }),
    ).rejects.toThrow("duplicate question type");
  });

  it("validates supplied analysis against request, project, context, and analysis hashes", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });

    const reused = await resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
      analysis,
    });

    expect(reused.analysis_metadata.analysis_hash).toBe(analysis.analysis_metadata.analysis_hash);

    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term again.", {
        analysis,
      }),
    ).rejects.toThrow("does not match the current request");
  });

  it("keeps stable ids across semantically equivalent raw outputs with different order", async () => {
    const repo = track(await createFixtureRepo());
    const firstResolver = () =>
      ({
        summary: "Rename the glossary term and adjust the backend architecture.",
        recommended_tranche_title: "Rename Glossary Term",
        affected_artifacts: ["ARCHITECTURE.md", "GLOSSARY.md"],
        affected_modules: ["server", "governance"],
        question_types: ["architecture_direction", "terminology_integrity"],
        draft_assumptions: [],
      }) satisfies IntakeModelOutput;
    const secondResolver = () =>
      ({
        summary: "Rename the glossary term and adjust the backend architecture.",
        recommended_tranche_title: "Rename Glossary Term",
        affected_artifacts: ["GLOSSARY.md", "ARCHITECTURE.md", "GLOSSARY.md"],
        affected_modules: ["governance", "server"],
        question_types: ["terminology_integrity", "architecture_direction"],
        draft_assumptions: [],
      }) satisfies IntakeModelOutput;

    const first = await analyzeRequest(repo.rootDir, "Rename the glossary term and adjust the backend architecture.", {
      client: createStubIntakeClient(firstResolver),
    });
    const second = await analyzeRequest(repo.rootDir, "Rename the glossary term and adjust the backend architecture.", {
      client: createStubIntakeClient(secondResolver),
    });

    expect(first.material_questions.map((question) => question.id)).toEqual(
      second.material_questions.map((question) => question.id),
    );
    expect(first.material_questions.map((question) => question.display_id)).toEqual(
      second.material_questions.map((question) => question.display_id),
    );
  });
});
