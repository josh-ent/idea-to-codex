import request from "supertest";
import { describe, expect, it } from "vitest";

import { analyzeRequest } from "../src/modules/intake/service.js";
import { createApp } from "../src/server/app.js";

describe("intake analysis", () => {
  it("classifies terminology-sensitive requests as material", () => {
    const analysis = analyzeRequest(
      "Rename tranche to milestone and update glossary and package wording.",
    );

    expect(analysis.affected_artifacts).toContain("GLOSSARY.md");
    expect(analysis.material_questions.some((question) => question.blocking)).toBe(true);
    expect(analysis.material_questions.map((question) => question.type)).toContain(
      "terminology_integrity",
    );
  });

  it("exposes intake analysis through the API", async () => {
    const app = createApp(process.cwd());
    const response = await request(app).post("/api/intake/analyze").send({
      request:
        "We need a clearer operator workflow for package generation and approval.",
    });

    expect(response.status).toBe(200);
    expect(response.body.affected_modules).toContain("ui");
    expect(response.body.material_questions.length).toBeGreaterThan(0);
  });
});
