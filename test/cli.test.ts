import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildProposalDraftRecord,
  buildProposalSetRecord,
  buildTrancheRecord,
  createFixtureRepo,
  seedValidRepository,
  type FixtureRepo,
} from "./helpers/repo-fixture.js";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const tsxCliPath = path.join(projectRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntryPath = path.join(projectRoot, "src/cli.ts");

const repos: FixtureRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function track(repo: FixtureRepo): FixtureRepo {
  repos.push(repo);
  return repo;
}

async function runCli(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
      cwd,
    });

    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

describe("cli commands", () => {
  it("validates a seeded repository successfully", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["validate"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("repository validation passed");
  });

  it("prints JSON for package plan without persistence", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["package", "plan", "TRANCHE-001", "--no-persist"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"id": "PLAN-TRANCHE-001"');
    expect(result.stdout).toContain('"path": "handoffs/plan/tranche-001-plan.md"');
  });

  it("prints JSON for review without persistence", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["review", "TRANCHE-001", "--no-persist"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"id": "REVIEW-TRANCHE-001"');
    expect(result.stdout).toContain('"path": "docs/reviews/REVIEW-TRANCHE-001.md"');
  });

  it("prints JSON for package refresh without persistence", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["package:refresh", "TRANCHE-001", "--no-persist"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"tranche_id": "TRANCHE-001"');
    expect(result.stdout).toContain('"type": "plan"');
    expect(result.stdout).toContain('"type": "execution"');
  });

  it("exits non-zero for an invalid package type", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["package", "invalid"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("usage: package <plan|execution>");
  });

  it("exits non-zero for an unknown tranche during package generation", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["package", "plan", "TRANCHE-999", "--no-persist"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Unknown tranche: TRANCHE-999");
  });

  it("exits non-zero for an unknown tranche during review generation", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["review", "TRANCHE-999", "--no-persist"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Unknown tranche: TRANCHE-999");
  });

  it("prints JSON for review proposal generation", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);

    const result = await runCli(repo.rootDir, ["proposal:review", "TRANCHE-001"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"source_type": "review"');
    expect(result.stdout).toContain('"drafts"');
  });

  it("approves and rejects proposals from the cli", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo, {
      proposals: [
        {
          path: "docs/proposals/PROPOSAL-001/SET.md",
          content: buildProposalSetRecord(),
        },
        {
          path: "docs/proposals/PROPOSAL-001/backlog.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-BACKLOG",
            proposalSetId: "PROPOSAL-001",
            targetArtifact: "BACKLOG.md",
            proposedContent: "# Backlog\n\n- [ ] Reviewed change.\n",
          }),
        },
        {
          path: "docs/proposals/PROPOSAL-001/assumptions.md",
          content: buildProposalDraftRecord({
            id: "PROPOSAL-001-ASSUMPTIONS",
            proposalSetId: "PROPOSAL-001",
            targetArtifact: "ASSUMPTIONS.md",
            proposedContent: "# Assumptions\n\n## Active assumptions\n\n- `A-001`: Fixture assumption one.\n",
          }),
        },
      ],
    });

    const approveResult = await runCli(repo.rootDir, ["proposal:approve", "PROPOSAL-001-BACKLOG"]);
    const rejectResult = await runCli(repo.rootDir, ["proposal:reject", "PROPOSAL-001-ASSUMPTIONS"]);

    expect(approveResult.code).toBe(0);
    expect(approveResult.stdout).toContain('"status": "approved"');
    expect(rejectResult.code).toBe(0);
    expect(rejectResult.stdout).toContain('"status": "rejected"');
  });
});
