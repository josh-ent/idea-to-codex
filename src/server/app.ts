import express from "express";
import fs from "node:fs";
import path from "node:path";

import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "../modules/artifacts/repository.js";
import { generateReview } from "../modules/governance/review.js";
import { analyzeRequest } from "../modules/intake/service.js";
import { generatePackage } from "../modules/packaging/service.js";

export function createApp(rootDir: string) {
  const app = express();
  const webDistPath = path.join(rootDir, "web/dist");
  const webIndexPath = path.join(webDistPath, "index.html");

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/status", async (_request, response, next) => {
    try {
      const validation = await validateRepository(rootDir);
      response.json({
        validation,
        errors: collectValidationErrors(validation),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bootstrap", async (_request, response, next) => {
    try {
      const created = await bootstrapRepository(rootDir);
      const validation = await validateRepository(rootDir);
      response.status(201).json({
        created,
        validation,
        errors: collectValidationErrors(validation),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/packages/:type/:trancheId", async (request, response, next) => {
    if (request.params.type !== "plan" && request.params.type !== "execution") {
      response.status(400).json({
        error: "type must be plan or execution",
      });
      return;
    }

    try {
      response.status(201).json(
        await generatePackage(
          rootDir,
          request.params.type as "plan" | "execution",
          request.params.trancheId,
          request.body?.persist !== false,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews/:trancheId", async (request, response, next) => {
    try {
      response.status(201).json(
        await generateReview(
          rootDir,
          request.params.trancheId,
          request.body?.persist !== false,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/intake/analyze", async (request, response, next) => {
    try {
      const requestText =
        typeof request.body?.request === "string" ? request.body.request : "";

      response.status(200).json(analyzeRequest(requestText));
    } catch (error) {
      next(error);
    }
  });

  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));

    app.get(/^\/(?!api).*/, (_request, response) => {
      response.sendFile(webIndexPath);
    });
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(500).json({
        error: error instanceof Error ? error.message : "unknown error",
      });
    },
  );

  return app;
}
