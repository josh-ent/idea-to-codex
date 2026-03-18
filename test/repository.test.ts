import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  collectValidationErrors,
  validateRepository,
} from "../src/modules/artifacts/repository.js";
import { generatePackage } from "../src/modules/packaging/service.js";
import { generateReview } from "../src/modules/governance/review.js";
import { createApp } from "../src/server/app.js";

describe("repository contract", () => {
  it("validates the current repository state", async () => {
    const validation = await validateRepository(process.cwd());
    expect(validation.rootFiles.every((file) => file.exists)).toBe(true);
    expect(validation.directories.every((directory) => directory.exists)).toBe(true);
    expect(collectValidationErrors(validation)).toEqual([]);
  });

  it("generates a deterministic plan package for TRANCHE-001", async () => {
    const result = await generatePackage(process.cwd(), "plan", "TRANCHE-001");

    expect(result.record.id).toBe("PLAN-TRANCHE-001");
    expect(result.content).toContain("# Objective");
    expect(result.content).toContain("# Deferred Questions");
    expect(result.content).toContain("TRANCHE-001");
  });

  it("generates a deterministic review checkpoint for TRANCHE-001", async () => {
    const result = await generateReview(process.cwd(), "TRANCHE-001", false);

    expect(result.record.id).toBe("REVIEW-TRANCHE-001");
    expect(result.content).toContain("# Summary");
    expect(result.content).toContain("# Drift Signals");
    expect(result.content).toContain("TRANCHE-001");
  });

  it("serves status, package generation, and review routes", async () => {
    const app = createApp(process.cwd());

    const overview = await request(app).get("/api/status");
    expect(overview.status).toBe(200);
    expect(
      overview.body.validation.decisions.map(
        (record: { frontmatter?: { id?: string } }) => record.frontmatter?.id,
      ),
    ).toContain("DEC-001");
    expect(overview.body.errors).toEqual([]);

    const handoff = await request(app)
      .post("/api/packages/plan/TRANCHE-001")
      .send({ persist: false });
    expect(handoff.status).toBe(201);
    expect(handoff.body.record.id).toBe("PLAN-TRANCHE-001");

    const review = await request(app)
      .post("/api/reviews/TRANCHE-001")
      .send({ persist: false });
    expect(review.status).toBe(201);
    expect(review.body.record.id).toBe("REVIEW-TRANCHE-001");
  });
});
