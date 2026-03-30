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

  it("refuses workflow intake proposal generation until actor, use case, goal, and constraints are answered", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    await expect(
      generateIntakeProposalSet(
        repo.rootDir,
        "Improve the operator UI workflow for release review.",
        {
          "Q-001": "Release operator",
          "Q-002": "Approve generated package",
        },
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

  it("persists workflow context on workflow-scoped tranche drafts and links Actor and Use Case terms", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const proposalSet = await generateIntakeProposalSet(
      repo.rootDir,
      "Improve the operator UI workflow for release review.",
      {
        "Q-001": "Release operator",
        "Q-002": "Approve generated package",
        "Q-003": "Confirm the package is ready without reading raw markdown",
        "Q-004": "Keep approval-gated writes; show tranche scope before approval",
      },
    );

    const trancheDraft = proposalSet.drafts.find((draft) =>
      draft.record.target_artifact.startsWith("docs/tranches/"),
    );
    const glossaryDraft = proposalSet.drafts.find(
      (draft) => draft.record.target_artifact === "GLOSSARY.md",
    );

    expect(trancheDraft?.proposedContent).toContain("actor: Release operator");
    expect(trancheDraft?.proposedContent).toContain("use_case: Approve generated package");
    expect(trancheDraft?.proposedContent).toContain(
      "actor_goal: Confirm the package is ready without reading raw markdown",
    );
    expect(trancheDraft?.proposedContent).toContain("use_case_constraints:");
    expect(trancheDraft?.proposedContent).toContain("- Actor");
    expect(trancheDraft?.proposedContent).toContain("- Use Case");
    expect(glossaryDraft?.proposedContent).toContain("## Actor");
    expect(glossaryDraft?.proposedContent).toContain("## Use Case");
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

  it("rolls back approval when the proposed content would invalidate the repository", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: [
            "---",
            "id: PROPOSAL-001",
            "status: draft",
            "source_type: intake",
            "source_ref: INTAKE-PROPOSAL-001",
            "generated_on: 2026-03-30",
            "---",
            "",
            "# Summary",
            "",
            "Fixture proposal set.",
            "",
            "# Source Context",
            "",
            "- Fixture source.",
            "",
            "# Drafts",
            "",
            "- PROPOSAL-001-README: README.md",
            "",
          ].join("\n"),
        },
        {
          path: "docs/proposals/PROPOSAL-001/readme.md",
          content: [
            "---",
            "id: PROPOSAL-001-README",
            "proposal_set_id: PROPOSAL-001",
            "status: draft",
            "source_type: intake",
            "source_ref: INTAKE-PROPOSAL-001",
            "target_artifact: docs/tranches/TRANCHE-001-test.md",
            "target_kind: record",
            "generated_on: 2026-03-30",
            "---",
            "",
            "# Summary",
            "",
            "Break the tranche on purpose.",
            "",
            "# Source Context",
            "",
            "- Fixture source.",
            "",
            "# Proposed Content",
            "",
            "```md",
            "---",
            "id: TRANCHE-001",
            "title: Broken tranche",
            "status: invalid",
            "---",
            "",
            "# Scope",
            "",
            "- Broken scope.",
            "",
            "```",
            "",
          ].join("\n"),
        },
      ],
    });
    const originalTranche = await repo.read("docs/tranches/TRANCHE-001-test.md");

    await expect(approveProposalDraft(repo.rootDir, "PROPOSAL-001-README")).rejects.toThrow(
      "would leave the repository invalid",
    );

    const validation = await validateRepository(repo.rootDir);
    const draft = validation.proposalDrafts.find(
      (record) => record.frontmatter?.id === "PROPOSAL-001-README",
    );

    expect(await repo.read("docs/tranches/TRANCHE-001-test.md")).toBe(originalTranche);
    expect(draft?.frontmatter?.status).toBe("draft");
  });
});
