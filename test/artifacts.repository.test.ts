import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "../src/modules/artifacts/repository.js";
import {
  buildDecisionRecord,
  buildHandoffRecord,
  buildReviewRecord,
  buildTrancheRecord,
  buildPlanMd,
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

describe("repository validation", () => {
  it("bootstraps idempotently", async () => {
    const repo = track(await createFixtureRepo());

    const firstCreated = await bootstrapRepository(repo.rootDir);
    const secondCreated = await bootstrapRepository(repo.rootDir);

    expect(firstCreated.length).toBeGreaterThan(0);
    expect(secondCreated).toEqual([]);
  });

  it("reports missing required top-level files", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.remove("README.md");

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("missing file: README.md");
  });

  it("reports missing required directories", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.remove("docs/reviews");

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("missing directory: docs/reviews");
  });

  it("reports invalid decision front matter", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [
        {
          path: "docs/decisions/DEC-001-test.md",
          content: buildDecisionRecord({ status: "broken" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.decisions[0]?.errors.some((error) => error.includes("status"))).toBe(true);
  });

  it("reports invalid tranche front matter", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ priority: "urgent" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.tranches[0]?.errors.some((error) => error.includes("priority"))).toBe(true);
  });

  it("reports invalid review front matter", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      reviews: [
        {
          path: "docs/reviews/REVIEW-TRANCHE-001.md",
          content: buildReviewRecord({ status: "broken" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.reviews[0]?.errors.some((error) => error.includes("status"))).toBe(true);
  });

  it("reports duplicate decision ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [
        {
          path: "docs/decisions/DEC-001-a.md",
          content: buildDecisionRecord({ id: "DEC-001" }),
        },
        {
          path: "docs/decisions/DEC-001-b.md",
          content: buildDecisionRecord({ id: "DEC-001", title: "Duplicate decision" }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("duplicate decision id: DEC-001");
  });

  it("reports duplicate tranche ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-a.md",
          content: buildTrancheRecord({ id: "TRANCHE-001" }),
        },
        {
          path: "docs/tranches/TRANCHE-001-b.md",
          content: buildTrancheRecord({ id: "TRANCHE-001", title: "Duplicate tranche" }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("duplicate tranche id: TRANCHE-001");
  });

  it("reports duplicate review ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      reviews: [
        {
          path: "docs/reviews/REVIEW-TRANCHE-001-a.md",
          content: buildReviewRecord({ id: "REVIEW-TRANCHE-001" }),
        },
        {
          path: "docs/reviews/REVIEW-TRANCHE-001-b.md",
          content: buildReviewRecord({ id: "REVIEW-TRANCHE-001" }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("duplicate review id: REVIEW-TRANCHE-001");
  });

  it("reports missing required markdown sections", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [
        {
          path: "docs/decisions/DEC-001-test.md",
          content: buildDecisionRecord({ omitSections: ["Consequences"] }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.decisions[0]?.errors).toContain("missing section: Consequences");
  });

  it("reports wrong handoff type in the plan directory", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      planPackages: [
        {
          path: "handoffs/plan/tranche-001-plan.md",
          content: buildHandoffRecord({ type: "execution" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.planPackages[0]?.errors.some((error) => error.includes("type"))).toBe(true);
  });

  it("treats a plan without the open-question heading as an empty list", async () => {
    const repo = track(
      await createFixtureRepo({
        planContent: "# PLAN\n\nNo open questions heading here.\n",
      }),
    );
    await seedValidRepository(repo, {
      planContent: "# PLAN\n\nNo open questions heading here.\n",
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.openQuestions).toEqual([]);
  });
});
