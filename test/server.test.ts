import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/server/app.js";
import {
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

describe("server routes", () => {
  it("returns a health payload", async () => {
    const app = createApp(process.cwd());
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("bootstraps a minimal fixture repository", async () => {
    const repo = track(await createFixtureRepo());
    const app = createApp(repo.rootDir);

    const response = await request(app).post("/api/bootstrap");

    expect(response.status).toBe(201);
    expect(response.body.created).toContain("README.md");
    expect(response.body.validation.rootFiles.every((file: { exists: boolean }) => file.exists)).toBe(
      true,
    );
  });

  it("rejects invalid package types with a 400", async () => {
    const app = createApp(process.cwd());
    const response = await request(app).post("/api/packages/not-a-type/TRANCHE-001");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("type must be plan or execution");
  });

  it("returns a 500 when package generation targets an unknown tranche", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createApp(repo.rootDir);

    const response = await request(app)
      .post("/api/packages/plan/TRANCHE-999")
      .send({ persist: false });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Unknown tranche: TRANCHE-999");
  });

  it("returns a 500 when review generation targets an unknown tranche", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    const app = createApp(repo.rootDir);

    const response = await request(app)
      .post("/api/reviews/TRANCHE-999")
      .send({ persist: false });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Unknown tranche: TRANCHE-999");
  });

  it("returns the empty/default intake analysis for missing or non-string request bodies", async () => {
    const app = createApp(process.cwd());

    const missingResponse = await request(app).post("/api/intake/analyze").send({});
    expect(missingResponse.status).toBe(200);
    expect(missingResponse.body.summary).toBe("No request provided.");
    expect(missingResponse.body.material_questions[0]?.type).toBe("bounded_change");

    const nonStringResponse = await request(app)
      .post("/api/intake/analyze")
      .send({ request: 42 });
    expect(nonStringResponse.status).toBe(200);
    expect(nonStringResponse.body.summary).toBe("No request provided.");
    expect(nonStringResponse.body.material_questions[0]?.type).toBe("bounded_change");
  });

  it("serves the built operator console for non-api routes", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.write(
      "web/dist/index.html",
      "<!doctype html><html><body>operator console</body></html>",
    );
    const app = createApp(repo.rootDir);

    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("operator console");
  });

  it("does not let the static fallback intercept unknown api routes", async () => {
    const repo = track(await createFixtureRepo());
    await seedValidRepository(repo);
    await repo.write(
      "web/dist/index.html",
      "<!doctype html><html><body>operator console</body></html>",
    );
    const app = createApp(repo.rootDir);

    const response = await request(app).get("/api/not-found");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("operator console");
  });
});
