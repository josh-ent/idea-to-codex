import { afterEach, describe, expect, it } from "vitest";

import { validateRepository } from "../src/modules/artifacts/repository.js";
import {
  approveProposalDraft,
  generateIntakeProposalSet,
  generateReviewProposalSet,
  rejectProposalDraft,
} from "../src/modules/proposals/service.js";
import {
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

describe("proposal workflow", () => {
  it("refuses intake proposal generation when blocking questions are unanswered", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    await expect(
      generateIntakeProposalSet(
        repo.rootDir,
        "Rename the glossary term and change the backend architecture.",
        {},
      ),
    ).rejects.toThrow("Unanswered blocking material questions");
  });

  it("creates grouped intake drafts for supported artefacts", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const proposalSet = await generateIntakeProposalSet(
      repo.rootDir,
      "Rename the glossary term, change the backend architecture, and tighten the approval governance.",
      {
        "Q-001": "Canonical replacement: `Proposal Draft`.",
        "Q-002": "The backend owns truth mutation and the console only requests approval.",
        "Q-003": "Human approval remains mandatory before meaning-bearing writes.",
      },
    );

    expect(proposalSet.record.source_type).toBe("intake");
    expect(proposalSet.drafts.map((draft) => draft.record.target_artifact)).toEqual(
      expect.arrayContaining([
        "BACKLOG.md",
        "ASSUMPTIONS.md",
        "GLOSSARY.md",
      ]),
    );
    expect(
      proposalSet.drafts.some((draft) => draft.record.target_artifact.startsWith("docs/tranches/")),
    ).toBe(true);
    expect(
      proposalSet.drafts.some((draft) => draft.record.target_artifact.startsWith("docs/decisions/")),
    ).toBe(true);
  });

  it("creates review follow-up drafts only for supported artefacts", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      decisions: [],
      tranches: [
        {
          path: "docs/tranches/TRANCHE-001-test.md",
          content: buildTrancheRecord({
            affectedArtifacts: ["ARCHITECTURE.md"],
            relatedDecisions: [],
            relatedTerms: ["Missing Term"],
            status: "approved",
          }),
        },
      ],
    });

    const proposalSet = await generateReviewProposalSet(repo.rootDir, "TRANCHE-001");

    expect(proposalSet.record.source_type).toBe("review");
    expect(proposalSet.drafts.map((draft) => draft.record.target_artifact)).toEqual(
      expect.arrayContaining(["GLOSSARY.md"]),
    );
    expect(
      proposalSet.drafts.every(
        (draft) =>
          draft.record.target_artifact === "GLOSSARY.md" ||
          draft.record.target_artifact.startsWith("docs/decisions/") ||
          draft.record.target_artifact.startsWith("docs/tranches/"),
      ),
    ).toBe(true);
  });

  it("approves a backlog draft and leaves sibling drafts untouched", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const proposalSet = await generateIntakeProposalSet(
      repo.rootDir,
      "Tidy the current fixture output.",
      {},
    );
    const backlogDraft = proposalSet.drafts.find(
      (draft) => draft.record.target_artifact === "BACKLOG.md",
    );

    expect(backlogDraft).toBeDefined();

    await approveProposalDraft(repo.rootDir, backlogDraft!.id);

    const backlog = await repo.read("BACKLOG.md");
    const refreshed = await validateRepository(repo.rootDir);
    const approvedDraft = refreshed.proposalDrafts.find(
      (draft) => draft.frontmatter?.id === backlogDraft!.id,
    );
    const siblingDraft = refreshed.proposalDrafts.find(
      (draft) =>
        draft.frontmatter?.proposal_set_id === backlogDraft!.record.proposal_set_id &&
        draft.frontmatter?.id !== backlogDraft!.id,
    );

    expect(backlog).toContain("`TRANCHE-002`");
    expect(approvedDraft?.frontmatter?.status).toBe("approved");
    expect(siblingDraft?.frontmatter?.status).toBe("draft");
    expect(
      refreshed.traceLinks.some(
        (link) =>
          link.fromType === "proposal" &&
          link.fromId === backlogDraft!.id &&
          link.toType === "artifact" &&
          link.toId === "BACKLOG.md",
      ),
    ).toBe(true);
  });

  it("approves assumptions, glossary, tranche, and decision drafts into their target artefacts", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const proposalSet = await generateIntakeProposalSet(
      repo.rootDir,
      "Rename the glossary term, change the backend architecture, and tighten the approval governance.",
      {
        "Q-001": "Canonical replacement: `Proposal Draft`.",
        "Q-002": "The backend owns truth mutation and the console only requests approval.",
        "Q-003": "Human approval remains mandatory before meaning-bearing writes.",
      },
    );

    for (const targetArtifact of ["ASSUMPTIONS.md", "GLOSSARY.md"]) {
      const draft = proposalSet.drafts.find((entry) => entry.record.target_artifact === targetArtifact);
      expect(draft).toBeDefined();
      await approveProposalDraft(repo.rootDir, draft!.id);
    }

    const trancheDraft = proposalSet.drafts.find((draft) =>
      draft.record.target_artifact.startsWith("docs/tranches/"),
    );
    const decisionDraft = proposalSet.drafts.find((draft) =>
      draft.record.target_artifact.startsWith("docs/decisions/"),
    );

    expect(trancheDraft).toBeDefined();
    expect(decisionDraft).toBeDefined();

    await approveProposalDraft(repo.rootDir, trancheDraft!.id);
    await approveProposalDraft(repo.rootDir, decisionDraft!.id);

    expect(await repo.read("ASSUMPTIONS.md")).toContain("Q-003 was resolved as");
    expect(await repo.read("GLOSSARY.md")).toContain("## Proposal Draft");
    expect(await repo.exists(trancheDraft!.record.target_artifact)).toBe(true);
    expect(await repo.exists(decisionDraft!.record.target_artifact)).toBe(true);
  });

  it("rejects a draft without changing the target artefact", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const originalBacklog = await repo.read("BACKLOG.md");
    const proposalSet = await generateIntakeProposalSet(
      repo.rootDir,
      "Tidy the current fixture output.",
      {},
    );
    const backlogDraft = proposalSet.drafts.find(
      (draft) => draft.record.target_artifact === "BACKLOG.md",
    );

    expect(backlogDraft).toBeDefined();

    await rejectProposalDraft(repo.rootDir, backlogDraft!.id);

    const refreshed = await validateRepository(repo.rootDir);
    const rejectedDraft = refreshed.proposalDrafts.find(
      (draft) => draft.frontmatter?.id === backlogDraft!.id,
    );

    expect(await repo.read("BACKLOG.md")).toBe(originalBacklog);
    expect(rejectedDraft?.frontmatter?.status).toBe("rejected");
  });
});
