import express from "express";
import fs from "node:fs";
import path from "node:path";

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

export function createApp(studioRoot: string, options: ProjectServiceOptions = {}) {
  const app = express();
  const webDistPath = path.join(studioRoot, "web/dist");
  const webIndexPath = path.join(webDistPath, "index.html");

  app.use(express.json());

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

async function requireActiveProjectRoot(
  studioRoot: string,
  options: ProjectServiceOptions,
): Promise<string> {
  const workspace = await getProjectWorkspace(studioRoot, options);

  if (!workspace.active_project) {
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
