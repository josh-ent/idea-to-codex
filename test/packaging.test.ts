import { afterEach, describe, expect, it } from "vitest";

import { generatePackage } from "../src/modules/packaging/service.js";
import {
  buildPlanMd,
  buildTrancheRecord,
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

describe("package generation", () => {
  it("fails when repository validation fails", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.remove("README.md");

    await expect(generatePackage(repo.rootDir, "plan", "TRANCHE-001", false)).rejects.toThrow(
      "repository validation failed",
    );
  });

  it("fails for an unknown tranche id", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    await expect(generatePackage(repo.rootDir, "plan", "TRANCHE-999", false)).rejects.toThrow(
      "Unknown tranche: TRANCHE-999",
    );
  });

  it("includes all assumptions when the tranche does not filter them", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ relatedAssumptions: [] }),
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain("A-001: Fixture assumption one.");
    expect(result.content).toContain("A-002: Fixture assumption two.");
  });

  it("filters assumptions when the tranche specifies them", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ relatedAssumptions: ["A-002"] }),
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain("A-002: Fixture assumption two.");
    expect(result.content).not.toContain("A-001: Fixture assumption one.");
  });

  it("includes all glossary terms when the tranche does not filter them", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ relatedTerms: [] }),
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain("Artefact: A versioned repository item that carries project truth.");
    expect(result.content).toContain("Tranche: A bounded unit of work approved for planning, execution, and review.");
  });

  it("filters glossary terms when the tranche specifies them", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ relatedTerms: ["Tranche"] }),
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain("Tranche: A bounded unit of work approved for planning, execution, and review.");
    expect(result.content).not.toContain("Artefact: A versioned repository item that carries project truth.");
  });

  it("deduplicates relevant artefacts in output", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            affectedArtifacts: ["PLAN.md", "ARCHITECTURE.md", "PLAN.md", "GLOSSARY.md"],
          }),
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);
    const planMentions = result.content.match(/^- PLAN\.md$/gm) ?? [];

    expect(planMentions).toHaveLength(1);
  });

  it("includes planning sections only in the plan package", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      planContent: buildPlanMd(["Clarify fixture scope."]),
    });

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain("# Deferred Questions");
    expect(result.content).toContain("Clarify fixture scope.");
    expect(result.content).toContain("# Planning Success Criteria");
    expect(result.content).toContain("# Workflow Context");
    expect(result.content).not.toContain("# Review Triggers");
    expect(result.content).not.toContain("# Definition Of Done");
  });

  it("includes execution sections only in the execution package", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await generatePackage(repo.rootDir, "execution", "TRANCHE-001", false);

    expect(result.content).toContain("# Execution Conduct");
    expect(result.content).toContain("Make frequent, sensible, atomic commits at meaningful checkpoints.");
    expect(result.content).toContain("# Validation Requirements");
    expect(result.content).toContain("# Review Triggers");
    expect(result.content).toContain("# Definition Of Done");
    expect(result.content).toContain("# Workflow Context");
    expect(result.content).not.toContain("# Deferred Questions");
    expect(result.content).not.toContain("# Planning Success Criteria");
  });

  it("includes explicit no-context workflow wording for non-workflow tranches", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(result.content).toContain(
      "No Actor-scoped workflow context is defined for this tranche.",
    );
  });

  it("renders workflow context from tranche frontmatter when present", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            actor: "Release operator",
            useCase: "Approve generated package",
            actorGoal: "Confirm the package is ready without reading raw markdown",
            useCaseConstraints: [
              "Keep approval-gated writes",
              "Show tranche scope before approval",
            ],
            relatedTerms: ["Actor", "Use Case"],
          }),
        },
      ],
      glossaryTerms: [
        {
          term: "Actor",
          definition: "The external person or system role being described or critiqued.",
        },
        {
          term: "Use Case",
          definition: "A named goal-oriented interaction for workflow critique.",
        },
      ],
    });

    const result = await generatePackage(repo.rootDir, "execution", "TRANCHE-001", false);

    expect(result.content).toContain("- Actor: Release operator");
    expect(result.content).toContain("- Use Case: Approve generated package");
    expect(result.content).toContain(
      "- Goal: Confirm the package is ready without reading raw markdown",
    );
    expect(result.content).toContain("- Constraint: Keep approval-gated writes");
    expect(result.content).toContain("- Constraint: Show tranche scope before approval");
  });

  it("does not persist when persist is false", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", false);

    expect(await repo.exists(result.relativePath)).toBe(false);
  });

  it("persists to the expected path when persist is true", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);

    expect(result.relativePath).toBe("handoffs/plan/tranche-001-plan.md");
    expect(await repo.exists("handoffs/plan/tranche-001-plan.md")).toBe(true);
  });
});
