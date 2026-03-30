import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { generateReview } from "../src/modules/governance/review.js";
import { generatePackage } from "../src/modules/packaging/service.js";
import {
  buildDecisionRecord,
  buildHandoffRecord,
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

describe("review checkpoints", () => {
  it("reports docs outpaced implementation when only a plan package exists", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ status: "approved" }),
        },
      ],
    });
    await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.record.status).toBe("attention_required");
    expect(review.content).toContain("docs outpaced implementation");
  });

  it("reports implementation outpaced docs when a complete tranche lacks execution coverage", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ status: "complete", acceptanceStatus: "met" }),
        },
      ],
    });
    await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.content).toContain("implementation outpaced docs");
  });

  it("reports terminology drift when tranche terms are missing from the glossary", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({ relatedTerms: ["Missing Term"] }),
        },
      ],
    });

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.content).toContain("terminology drift detected");
    expect(review.content).toContain(
      "Missing glossary terms for linked tranche terminology: Missing Term.",
    );
    expect(review.content).toContain(
      "Add the missing glossary terms before more docs or UI copy reuse them.",
    );
  });

  it("reports architecture intent drift when architecture is in scope without a linked decision", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [],
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            affectedArtifacts: ["ARCHITECTURE.md"],
            relatedDecisions: [],
          }),
        },
      ],
    });

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.content).toContain("architecture intent drift detected");
    expect(review.content).toContain(
      "ARCHITECTURE.md is in scope but no linked decision record explains the intended boundary change.",
    );
    expect(review.content).toContain(
      "Capture the architecture change in a decision record linked to the tranche.",
    );
  });

  it("uses attention required when repository validation has errors", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [
        {
          path: "docs/decisions/DEC-001-test.md",
          content: buildDecisionRecord({ status: "broken" }),
        },
      ],
    });

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.record.status).toBe("attention_required");
    expect(review.content).toContain("Validation issue:");
  });

  it("uses recorded when validation and drift are clean", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);
    await generatePackage(repo.rootDir, "execution", "TRANCHE-001", true);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.record.status).toBe("recorded");
    expect(review.content).toContain("No configured drift signals detected.");
    expect(review.content).toContain("No durable drift findings detected.");
  });

  it("reports workflow context propagation drift when linked packages are missing workflow context", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            actor: "Release operator",
            useCase: "Approve generated package",
            actorGoal: "Confirm the package is ready without reading raw markdown",
            useCaseConstraints: ["Keep approval-gated writes"],
            relatedTerms: ["Actor", "Use Case"],
          }),
        },
      ],
      planPackages: [
        {
          path: "handoffs/plan/tranche-001-plan.md",
          content: buildHandoffRecord({ omitSections: ["Workflow Context"] }),
        },
      ],
      executionPackages: [
        {
          path: "handoffs/execution/tranche-001-execution.md",
          content: buildHandoffRecord({ type: "execution", omitSections: ["Workflow Context"] }),
        },
      ],
    });

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.content).toContain("workflow context not propagated into packages");
    expect(review.content).toContain("Linked packages are missing or out of sync with Workflow Context");
    expect(review.content).toContain("Regenerate linked handoff packages so Workflow Context matches the tranche.");
  });

  it("reports placeholder workflow context values", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            actor: "Actor",
            useCase: "Use Case",
            actorGoal: "Improve workflow",
            useCaseConstraints: ["Keep approval-gated writes"],
            relatedTerms: ["Actor", "Use Case"],
          }),
        },
      ],
    });
    await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);
    await generatePackage(repo.rootDir, "execution", "TRANCHE-001", true);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.content).toContain("workflow context still uses placeholder values");
    expect(review.content).toContain(
      "Workflow context still uses placeholder values in: actor, use_case, actor_goal.",
    );
    expect(review.content).toContain(
      "Replace placeholder workflow values with concrete Actor, Use Case, Goal, and Constraint wording.",
    );
  });

  it("reports execution conduct drift when the repository is dirty", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await generatePackage(repo.rootDir, "plan", "TRANCHE-001", true);
    await generatePackage(repo.rootDir, "execution", "TRANCHE-001", true);

    execFileSync("git", ["init", "-b", "main"], { cwd: repo.rootDir });
    execFileSync("git", ["config", "user.name", "Fixture User"], { cwd: repo.rootDir });
    execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: repo.rootDir });
    execFileSync("git", ["add", "."], { cwd: repo.rootDir });
    execFileSync("git", ["commit", "-m", "Fixture baseline"], { cwd: repo.rootDir });
    await repo.write("README.md", "# Fixture\n\nDirty change.\n");

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(review.record.status).toBe("attention_required");
    expect(review.content).toContain("execution conduct drift detected");
    expect(review.content).toContain("Repository branch at review time: main.");
    expect(review.content).toContain("Repository dirty at review time: yes.");
    expect(review.content).toContain("Repository has uncommitted changes: README.md.");
    expect(review.content).toContain(
      "Repository is dirty on main; execution conduct requires branch or worktree isolation.",
    );
    expect(review.content).toContain(
      "Checkpoint the current repository changes in a commit before treating execution as review-ready.",
    );
  });

  it("does not persist when persist is false", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", false);

    expect(await repo.exists(review.relativePath)).toBe(false);
  });

  it("persists when persist is true", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const review = await generateReview(repo.rootDir, "TRANCHE-001", true);

    expect(await repo.exists(review.relativePath)).toBe(true);
  });
});
