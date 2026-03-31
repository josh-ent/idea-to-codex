import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  analyzeRequest,
  resolveIntakeAnalysis,
} from "../src/modules/intake/service.js";
import {
  intakePromptVersion,
  intakeSchemaVersion,
  type IntakeAnalysis,
  type IntakeModelOutput,
  type IntakeQuestionType,
} from "../src/modules/intake/contract.js";
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

function cloneAnalysis(analysis: IntakeAnalysis): IntakeAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as IntakeAnalysis;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readPromptSourceFragment(prompt: string, relativePath: string): string {
  const sourcePattern = new RegExp(
    `## ${escapeRegExp(relativePath)}\\n([\\s\\S]*?)(?=\\n\\n## [^\\n]+\\n|$)`,
  );
  const match = sourcePattern.exec(prompt);

  return match?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  it("canonicalizes supplied analysis through the same path as omitted analysis", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(
      repo.rootDir,
      "Rename the glossary term and adjust the backend architecture.",
      {
        client: createStubIntakeClient(),
      },
    );
    const supplied = cloneAnalysis(analysis);

    supplied.affected_artifacts = [
      "",
      ...analysis.affected_artifacts,
      analysis.affected_artifacts[0] ?? "",
    ];
    supplied.affected_modules = [
      "",
      ...analysis.affected_modules,
      analysis.affected_modules[0] ?? "",
    ];
    supplied.draft_assumptions = [
      "",
      ...analysis.draft_assumptions,
      analysis.draft_assumptions[0] ?? "",
    ];
    supplied.material_questions = [...supplied.material_questions]
      .reverse()
      .map((question) => ({
        ...question,
        display_id: "Q-999",
      }));

    const reused = await resolveIntakeAnalysis(
      repo.rootDir,
      "Rename the glossary term and adjust the backend architecture.",
      {
        analysis: supplied,
      },
    );

    expect(reused).toEqual(analysis);
  });

  it("rebuilds supplied material questions from canonical question types only", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });
    const supplied = cloneAnalysis(analysis);

    supplied.material_questions = supplied.material_questions.map((question) => ({
      ...question,
      id: "bounded_change" satisfies IntakeQuestionType,
      display_id: "Q-999",
      blocking: !question.blocking,
      default_recommendation: "Ignore this supplied recommendation.",
      consequence_of_non_decision: "Ignore this supplied consequence.",
      affected_artifacts: ["IGNORED.md"],
      prompt: "Ignore this supplied prompt.",
    }));

    const reused = await resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
      analysis: supplied,
    });

    expect(reused).toEqual(analysis);
  });

  it("rejects duplicate supplied question types as a contract violation", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });
    const supplied = cloneAnalysis(analysis);

    supplied.material_questions.push(cloneAnalysis(analysis).material_questions[0]!);

    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis: supplied,
      }),
    ).rejects.toMatchObject({
      code: "contract_violation",
    });
  });

  it("rejects unknown supplied question types as a contract violation", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });
    const supplied = cloneAnalysis(analysis) as unknown as {
      material_questions: Array<Record<string, unknown>>;
    };

    supplied.material_questions[0] = {
      ...supplied.material_questions[0],
      type: "unknown_question_type",
    };

    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis: supplied,
      }),
    ).rejects.toMatchObject({
      code: "contract_violation",
    });
  });

  it("emits dedicated mismatch codes for request, project, and context drift", async () => {
    const repo = track(await createFixtureRepo());
    const otherRepo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });

    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term again.", {
        analysis,
      }),
    ).rejects.toMatchObject({
      code: "analysis_request_mismatch",
    });

    await expect(
      resolveIntakeAnalysis(otherRepo.rootDir, "Rename the glossary term.", {
        analysis,
      }),
    ).rejects.toMatchObject({
      code: "analysis_project_mismatch",
    });

    await repo.write("PLAN.md", "# PLAN\n\n## 18. Open Questions That Genuinely Need Answering\n\n- Changed.\n");

    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis,
      }),
    ).rejects.toMatchObject({
      code: "analysis_context_mismatch",
    });
  });

  it("emits schema, prompt, and analysis hash mismatch codes once request, project, and context match", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Rename the glossary term.", {
      client: createStubIntakeClient(),
    });

    const schemaMismatch = cloneAnalysis(analysis);
    schemaMismatch.analysis_metadata.schema_version = intakeSchemaVersion + 1;
    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis: schemaMismatch,
      }),
    ).rejects.toMatchObject({
      code: "analysis_schema_version_mismatch",
    });

    const promptMismatch = cloneAnalysis(analysis);
    promptMismatch.analysis_metadata.prompt_version = `${intakePromptVersion}-different`;
    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis: promptMismatch,
      }),
    ).rejects.toMatchObject({
      code: "analysis_prompt_version_mismatch",
    });

    const hashMismatch = cloneAnalysis(analysis);
    hashMismatch.analysis_metadata.analysis_hash = sha256("different-analysis");
    await expect(
      resolveIntakeAnalysis(repo.rootDir, "Rename the glossary term.", {
        analysis: hashMismatch,
      }),
    ).rejects.toMatchObject({
      code: "analysis_hash_mismatch",
    });
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

  it("hashes the exact prompt-used normalized and truncated source fragment", async () => {
    const repo = track(
      await createFixtureRepo({
        projectAimsContent: "# PROJECT AIMS\r\n\r\nFixture project aims.\r\n\r\n",
      }),
    );
    let capturedPrompt = "";
    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(undefined, {
        onAnalyzeInput(input) {
          capturedPrompt = input.prompt;
        },
      }),
    });

    const projectAimsFragment = readPromptSourceFragment(capturedPrompt, "PROJECT_AIMS.md");
    const projectAimsMetadata = analysis.analysis_metadata.context_sources_used.find(
      (source) => source.path === "PROJECT_AIMS.md",
    );

    expect(projectAimsFragment).toBe("# PROJECT AIMS\n\nFixture project aims.");
    expect(projectAimsMetadata?.content_hash).toBe(sha256(projectAimsFragment));
    expect(capturedPrompt).not.toContain("(empty request)");
    expect(capturedPrompt).not.toContain("(empty)");
    expect(capturedPrompt).not.toContain("(no optional context available)");
  });

  it("discloses missing optional context while still succeeding", async () => {
    const repo = track(await createFixtureRepo());
    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(),
    });

    expect(
      analysis.analysis_metadata.context_sources_missing.map((entry) => entry.path),
    ).toEqual(
      expect.arrayContaining([
        "ARCHITECTURE.md",
        "GLOSSARY.md",
        "DATA_DICTIONARY.md",
        "ASSUMPTIONS.md",
        "RISKS.md",
        "BACKLOG.md",
      ]),
    );
  });

  it("discloses invalid UTF-8 optional context while still succeeding", async () => {
    const repo = track(await createFixtureRepo());
    const architecturePath = path.join(repo.rootDir, "ARCHITECTURE.md");

    await fs.writeFile(architecturePath, Buffer.from([0xc3, 0x28]));

    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(),
    });

    expect(analysis.analysis_metadata.context_sources_invalid).toContainEqual({
      path: "ARCHITECTURE.md",
      reason: "invalid_utf8",
    });
  });

  it("discloses truncation while still succeeding", async () => {
    const repo = track(await createFixtureRepo());

    await repo.write("ARCHITECTURE.md", "A".repeat(9_000));

    const analysis = await analyzeRequest(repo.rootDir, "Tidy the current fixture output.", {
      client: createStubIntakeClient(),
    });

    expect(analysis.analysis_metadata.context_truncated).toBe(true);
    expect(analysis.analysis_metadata.context_sources_used).toContainEqual({
      path: "ARCHITECTURE.md",
      content_hash: expect.any(String),
      truncated: true,
    });
  });
});
