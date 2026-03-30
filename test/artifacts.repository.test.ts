import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "../src/modules/artifacts/repository.js";
import {
  buildDecisionRecord,
  buildHandoffRecord,
  buildProposalDraftRecord,
  buildProposalSetRecord,
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

  it("reports incomplete workflow context on workflow-scoped tranches", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ actor: "Release operator" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.tranches[0]?.errors.some((error) => error.includes("use_case"))).toBe(true);
  });

  it("reports placeholder-only workflow constraints on workflow-scoped tranches", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            actor: "Release operator",
            useCase: "Approve generated package",
            actorGoal: "Confirm readiness",
            useCaseConstraints: ["workflow", "tbd"],
          }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(
      validation.tranches[0]?.errors.some((error) => error.includes("use_case_constraints")),
    ).toBe(true);
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

  it("reports invalid proposal set front matter", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ status: "broken" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.proposalSets[0]?.errors.some((error) => error.includes("status"))).toBe(true);
  });

  it("reports invalid proposal draft front matter", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord(),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({ targetKind: "invalid" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.proposalDrafts[0]?.errors.some((error) => error.includes("target_kind"))).toBe(true);
  });

  it("reports proposal sets that have no drafts", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({
            id: "PROPOSAL-001",
          }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("proposal set has no drafts: PROPOSAL-001");
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

  it("reports duplicate proposal set ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-001" }),
        },
        {
          path: "docs/proposals/PROPOSAL-002/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-001" }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("duplicate proposal set id: PROPOSAL-001");
  });

  it("reports duplicate proposal draft ids", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-001" }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({ id: "PROPOSAL-001-BACKLOG" }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/assumptions.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-BACKLOG",
            targetArtifact: "ASSUMPTIONS.md",
          }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain("duplicate proposal draft id: PROPOSAL-001-BACKLOG");
  });

  it("reports proposal set ids that do not match their directory", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-009" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.proposalSets[0]?.errors).toContain(
      "proposal set id must match directory name: expected PROPOSAL-001",
    );
  });

  it("reports proposal drafts whose proposal_set_id does not match their directory", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-001" }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-BACKLOG",
            proposalSetId: "PROPOSAL-009",
          }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.proposalDrafts[0]?.errors).toContain(
      "proposal_set_id must match directory name: expected PROPOSAL-001",
    );
  });

  it("reports proposal set status drift from child draft states", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord({ id: "PROPOSAL-001", status: "draft" }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-BACKLOG",
            proposalSetId: "PROPOSAL-001",
            status: "approved",
          }),
        },
      ],
    });

    const errors = collectValidationErrors(await validateRepository(repo.rootDir));

    expect(errors).toContain(
      "proposal set status drift: PROPOSAL-001 expected approved but found draft",
    );
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

  it("reports missing proposal draft sections", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord(),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({ omitSections: ["Proposed Content"] }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.proposalDrafts[0]?.errors).toContain("missing section: Proposed Content");
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

  it("reports missing workflow context sections in handoffs", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      planPackages: [
        {
          path: "handoffs/plan/tranche-001-plan.md",
          content: buildHandoffRecord({ omitSections: ["Workflow Context"] }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.planPackages[0]?.errors).toContain("missing section: Workflow Context");
  });

  it("reports wrong handoff type in the execution directory", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      executionPackages: [
        {
          path: "handoffs/execution/tranche-001-execution.md",
          content: buildHandoffRecord({ type: "plan" }),
        },
      ],
    });

    const validation = await validateRepository(repo.rootDir);

    expect(validation.executionPackages[0]?.errors.some((error) => error.includes("type"))).toBe(
      true,
    );
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
