import express from "express";
import fs from "node:fs";
import path from "node:path";

import {
  createLogger,
  generateRequestId,
  summarizeError,
  withLogContext,
} from "../runtime/logging.js";
import { getRepositoryState } from "../modules/artifacts/git.js";
import {
  bootstrapRepository,
  collectValidationErrors,
  type RepositoryValidation,
  validateRepository,
} from "../modules/artifacts/repository.js";
import { generateReview } from "../modules/governance/review.js";
import { analyzeRequest } from "../modules/intake/service.js";
import { generatePackage, refreshPackageSet } from "../modules/packaging/service.js";
import {
  createProject,
  getProjectWorkspace,
  openProject,
  type ProjectServiceOptions,
  selectProjectDirectory,
} from "../modules/projects/service.js";
import {
  approveProposalDraft,
  generateIntakeProposalSet,
  generateReviewProposalSet,
  getProposalSet,
  listProposalSets,
  rejectProposalDraft,
} from "../modules/proposals/service.js";

const logger = createLogger("server");

export function createApp(studioRoot: string, options: ProjectServiceOptions = {}) {
  const app = express();
  const webDistPath = path.join(studioRoot, "web/dist");
  const webIndexPath = path.join(webDistPath, "index.html");

  app.use(express.json());
  app.use((request, response, next) => {
    const requestId = generateRequestId();
    const requestPath = request.originalUrl || request.path;
    const requestLogger = logger.child("request", {
      request_id: requestId,
      request_method: request.method,
      request_path: requestPath,
    });
    const startedAt = Date.now();
    let responseFinished = false;

    response.on("finish", () => {
      responseFinished = true;
      requestLogger.info("request completed", {
        duration_ms: Date.now() - startedAt,
        response_content_length: response.getHeader("content-length"),
        status_code: response.statusCode,
      });
    });

    response.on("close", () => {
      if (!responseFinished) {
        requestLogger.warn("request closed before completion", {
          duration_ms: Date.now() - startedAt,
          status_code: response.statusCode,
        });
      }
    });

    withLogContext(
      {
        request_id: requestId,
        request_method: request.method,
        request_path: requestPath,
      },
      () => {
        requestLogger.debug("request received", summarizeRequest(request));
        next();
      },
    );
  });

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/status", async (_request, response, next) => {
    try {
      const workspace = await getProjectWorkspace(studioRoot, options);
      const projectRoot = workspace.active_project?.path;
      const validation = projectRoot
        ? await validateRepository(projectRoot)
        : emptyRepositoryValidation();
      const repositoryState = projectRoot
        ? await getRepositoryState(projectRoot)
        : unavailableRepositoryState();
      response.json({
        project: workspace,
        validation,
        repository_state: repositoryState,
        errors: collectValidationErrors(validation),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/create", async (request, response, next) => {
    try {
      response.status(201).json(
        await createProject(
          studioRoot,
          {
            project_name:
              typeof request.body?.project_name === "string" ? request.body.project_name : "",
            project_path:
              typeof request.body?.project_path === "string" ? request.body.project_path : "",
            initialize_git: request.body?.initialize_git !== false,
          },
          options,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/open", async (request, response, next) => {
    try {
      const projectPath =
        typeof request.body?.project_path === "string" ? request.body.project_path : "";

      response.status(200).json(await openProject(studioRoot, projectPath, options));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/select-directory", async (request, response, next) => {
    try {
      response.status(200).json({
        path: await selectProjectDirectory(
          studioRoot,
          {
            initial_path:
              typeof request.body?.initial_path === "string" ? request.body.initial_path : "",
            dialog_title:
              typeof request.body?.dialog_title === "string" ? request.body.dialog_title : "",
          },
          options,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bootstrap", async (_request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      const created = await bootstrapRepository(projectRoot);
      const validation = await validateRepository(projectRoot);
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
      logger.warn("request rejected due to invalid package type", {
        package_type: request.params.type,
        tranche_id: request.params.trancheId,
      });
      response.status(400).json({
        error: "type must be plan or execution",
      });
      return;
    }

    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(201).json(
        await generatePackage(
          projectRoot,
          request.params.type as "plan" | "execution",
          request.params.trancheId,
          request.body?.persist !== false,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/package-sets/:trancheId/refresh", async (request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(201).json(
        await refreshPackageSet(
          projectRoot,
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
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(201).json(
        await generateReview(
          projectRoot,
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

  app.get("/api/proposals", async (_request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(200).json(await listProposalSets(projectRoot));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/proposals/:proposalSetId", async (request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(200).json(await getProposalSet(projectRoot, request.params.proposalSetId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/proposals/intake", async (request, response, next) => {
    try {
      const requestText =
        typeof request.body?.request === "string" ? request.body.request : "";
      const answers =
        request.body?.answers && typeof request.body.answers === "object"
          ? Object.fromEntries(
              Object.entries(request.body.answers).filter(
                ([key, value]) => typeof key === "string" && typeof value === "string",
              ),
            )
          : {};

      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(201).json(
        await generateIntakeProposalSet(projectRoot, requestText, answers as Record<string, string>),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/proposals/review/:trancheId", async (request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(201).json(await generateReviewProposalSet(projectRoot, request.params.trancheId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/proposals/:proposalId/approve", async (request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(200).json(await approveProposalDraft(projectRoot, request.params.proposalId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/proposals/:proposalId/reject", async (request, response, next) => {
    try {
      const projectRoot = await requireActiveProjectRoot(studioRoot, options);
      response.status(200).json(await rejectProposalDraft(projectRoot, request.params.proposalId));
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
      request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error("request failed", {
        ...summarizeRequest(request),
        status_code: 500,
        ...summarizeError(error),
      });
      response.status(500).json({
        error: error instanceof Error ? error.message : "unknown error",
      });
    },
  );

  return app;
}

async function requireActiveProjectRoot(
  studioRoot: string,
  options: ProjectServiceOptions,
): Promise<string> {
  const workspace = await getProjectWorkspace(studioRoot, options);

  if (!workspace.active_project) {
    logger.warn("request requires an active project but none is selected", {
      studio_root: studioRoot,
    });
    throw new Error("No active project selected.");
  }

  return workspace.active_project.path;
}

function emptyRepositoryValidation(): RepositoryValidation {
  return {
    rootFiles: [],
    directories: [],
    decisions: [],
    proposalSets: [],
    proposalDrafts: [],
    tranches: [],
    reviews: [],
    planPackages: [],
    executionPackages: [],
    planTemplate: { path: "prompts/templates/plan-package.md", frontmatter: null, content: "", errors: [] },
    executionTemplate: { path: "prompts/templates/execution-package.md", frontmatter: null, content: "", errors: [] },
    assumptions: [],
    glossaryTerms: [],
    openQuestions: [],
    globalErrors: [],
    traceLinks: [],
  };
}

function unavailableRepositoryState() {
  return {
    available: false,
    branch: null,
    head: null,
    dirty_paths: [],
    is_dirty: false,
    is_main_branch: false,
  };
}

function summarizeRequest(request: express.Request) {
  return {
    body: summarizeBody(request.body),
    params: Object.keys(request.params).length > 0 ? request.params : undefined,
    query: Object.keys(request.query).length > 0 ? request.query : undefined,
  };
}

function summarizeBody(body: unknown) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return {
      length: body.length,
      preview: body.slice(0, 120),
      type: "string",
    };
  }

  if (typeof body !== "object") {
    return {
      type: typeof body,
      value: body,
    };
  }

  const entries = Object.entries(body as Record<string, unknown>);

  return Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      summarizeBodyValue(value),
    ]),
  );
}

function summarizeBodyValue(value: unknown) {
  if (typeof value === "string") {
    return {
      length: value.length,
      preview: value.slice(0, 120),
      type: "string",
    };
  }

  if (Array.isArray(value)) {
    return {
      length: value.length,
      type: "array",
    };
  }

  if (value && typeof value === "object") {
    return {
      keys: Object.keys(value as Record<string, unknown>),
      type: "object",
    };
  }

  return value;
}
