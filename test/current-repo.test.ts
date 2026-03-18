import { describe, expect, it } from "vitest";

import {
  collectValidationErrors,
  validateRepository,
} from "../src/modules/artifacts/repository.js";
import { generateReview } from "../src/modules/governance/review.js";
import { generatePackage } from "../src/modules/packaging/service.js";

describe("current repository contract", () => {
  it("validates cleanly", async () => {
    const validation = await validateRepository(process.cwd());

    expect(validation.rootFiles.every((file) => file.exists)).toBe(true);
    expect(validation.directories.every((directory) => directory.exists)).toBe(true);
    expect(collectValidationErrors(validation)).toEqual([]);
  });

  it("still generates the tranche 001 plan package", async () => {
    const result = await generatePackage(process.cwd(), "plan", "TRANCHE-001", false);

    expect(result.record.id).toBe("PLAN-TRANCHE-001");
  });

  it("still generates the tranche 001 review without persistence", async () => {
    const result = await generateReview(process.cwd(), "TRANCHE-001", false);

    expect(result.record.id).toBe("REVIEW-TRANCHE-001");
  });
});
