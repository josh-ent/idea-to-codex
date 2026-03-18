import { describe, expect, it } from "vitest";

import { analyzeRequest } from "../src/modules/intake/service.js";

describe("intake analysis", () => {
  it.each([
    {
      request: "Improve the operator UI workflow for package approval.",
      expectedType: "workflow_semantics",
      blocking: true,
    },
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
  ])("triggers the $expectedType rule", ({ request, expectedType, blocking }) => {
    const analysis = analyzeRequest(request);
    const question = analysis.material_questions.find((entry) => entry.type === expectedType);

    expect(question).toBeDefined();
    expect(question?.blocking).toBe(blocking);
  });

  it("merges multiple matching rules without duplicate artefacts or modules", () => {
    const analysis = analyzeRequest(
      "Rename the glossary term, adjust the operator workflow UI, and change the backend architecture.",
    );

    expect(analysis.material_questions.map((question) => question.type)).toEqual([
      "workflow_semantics",
      "terminology_integrity",
      "architecture_direction",
    ]);
    expect(analysis.affected_artifacts).toEqual([...new Set(analysis.affected_artifacts)]);
    expect(analysis.affected_modules).toEqual([...new Set(analysis.affected_modules)]);
  });

  it("returns the empty-request summary", () => {
    const analysis = analyzeRequest("");

    expect(analysis.summary).toBe("No request provided.");
    expect(analysis.material_questions[0]?.type).toBe("bounded_change");
  });

  it("uses the bounded-change default rule when nothing matches", () => {
    const analysis = analyzeRequest("Tidy the current fixture output.");

    expect(analysis.material_questions).toHaveLength(1);
    expect(analysis.material_questions[0]).toMatchObject({
      id: "Q-001",
      type: "bounded_change",
      blocking: false,
      default_recommendation:
        "Treat the request as a bounded change inside the current architecture until stronger evidence appears.",
    });
    expect(analysis.draft_assumptions).toEqual([
      "Proceed under the current architecture and glossary unless the request explicitly changes them.",
    ]);
  });

  it("assigns stable ids and retains rule metadata", () => {
    const analysis = analyzeRequest(
      "Improve the UI workflow and package handoff wording.",
    );

    expect(analysis.material_questions.map((question) => question.id)).toEqual(
      analysis.material_questions.map((_, index) => `Q-${String(index + 1).padStart(3, "0")}`),
    );
    expect(analysis.material_questions[0]?.status).toBe("open");
    expect(
      analysis.material_questions.some((question) =>
        question.default_recommendation.toLowerCase().includes("handoff"),
      ),
    ).toBe(true);
  });
});
