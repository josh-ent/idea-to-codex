import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "../src/modules/artifacts/repository.js";
import { createApp } from "../src/server/app.js";

const tempRoots: string[] = [];

describe("repository contract backend", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      }),
    );
  });

  test("bootstrap creates the missing baseline artefacts", async () => {
    const repoRoot = await createFixtureRepo();

    await bootstrapRepository(repoRoot);

    expect(await fileExists(path.join(repoRoot, "README.md"))).toBe(true);
    expect(await fileExists(path.join(repoRoot, "ARCHITECTURE.md"))).toBe(true);
    expect(await fileExists(path.join(repoRoot, "prompts/templates/plan-package.md"))).toBe(true);
  });

  test("validation succeeds on the seeded repository", async () => {
    const repoRoot = await createFixtureRepo();
    await bootstrapRepository(repoRoot);
    await seedOperationalRecords(repoRoot);

    const validation = await validateRepository(repoRoot);

    expect(validation.rootFiles.every((file) => file.exists)).toBe(true);
    expect(validation.directories.every((directory) => directory.exists)).toBe(true);
    expect(collectValidationErrors(validation)).toEqual([]);
    expect(validation.decisions.map((record) => record.frontmatter?.id)).toContain("DEC-001");
    expect(validation.tranches.map((record) => record.frontmatter?.id)).toContain("TRANCHE-001");
    expect(validation.traceLinks.length).toBeGreaterThan(0);
  });

  test("api can report status and generate a plan package", async () => {
    const repoRoot = await createFixtureRepo();
    await bootstrapRepository(repoRoot);
    await seedOperationalRecords(repoRoot);
    const app = createApp(repoRoot);

    const statusResponse = await request(app).get("/api/status");
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.errors).toEqual([]);

    const packageResponse = await request(app).post("/api/packages/plan/TRANCHE-001");
    expect(packageResponse.status).toBe(201);
    expect(packageResponse.body.record.id).toBe("PLAN-TRANCHE-001");

    const generatedPath = path.join(repoRoot, packageResponse.body.path);
    expect(await fileExists(generatedPath)).toBe(true);
    expect(await fs.readFile(generatedPath, "utf8")).toContain("# Objective");
  });

  test("server serves a built operator console when web/dist exists", async () => {
    const repoRoot = await createFixtureRepo();
    await bootstrapRepository(repoRoot);
    await seedOperationalRecords(repoRoot);
    await fs.mkdir(path.join(repoRoot, "web/dist"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "web/dist/index.html"),
      "<!doctype html><html><body>operator console</body></html>",
      "utf8",
    );

    const app = createApp(repoRoot);
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("operator console");
  });
});

async function createFixtureRepo(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "idea-to-codex-"));
  tempRoots.push(repoRoot);

  await fs.writeFile(
    path.join(repoRoot, "PROJECT_AIMS.md"),
    "# PROJECT AIMS\n\nFixture project aims.\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(repoRoot, "PLAN.md"),
    "# PLAN\n\n## 18. Open Questions That Genuinely Need Answering\n\n- None.\n",
    "utf8",
  );

  return repoRoot;
}

async function seedOperationalRecords(repoRoot: string): Promise<void> {
  await fs.mkdir(path.join(repoRoot, "docs/decisions"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "docs/tranches"), { recursive: true });

  await fs.writeFile(
    path.join(repoRoot, "docs/decisions/DEC-001-test.md"),
    `---
id: DEC-001
title: Fixture decision
status: locked
date: 2026-03-18
owners:
  - test-owner
related_tranches:
  - TRANCHE-001
affected_artifacts:
  - PLAN.md
supersedes: []
tags:
  - test
---

# Context

Fixture context.

# Decision

Fixture decision.

# Options considered

- Keep the fixture simple.

# Consequences

- Validation should pass.

# Follow-up actions

- None.
`,
    "utf8",
  );

  await fs.writeFile(
    path.join(repoRoot, "docs/tranches/TRANCHE-001-test.md"),
    `---
id: TRANCHE-001
title: Fixture tranche
status: approved
priority: high
goal: Validate the backend.
depends_on: []
affected_artifacts:
  - PLAN.md
  - ARCHITECTURE.md
affected_modules:
  - artifacts
  - packaging
related_decisions:
  - DEC-001
related_assumptions: []
related_terms:
  - Artefact
  - Tranche
review_trigger: tranche_complete
acceptance_status: in_progress
---

# Scope

- Validate the repository contract.

# Out of scope

- UI work.

# Preconditions

- Fixture documents exist.

# Acceptance criteria

- Generate a plan package.

# Risks / tensions

- Minimal fixture coverage.

# Notes

- None.
`,
    "utf8",
  );
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
