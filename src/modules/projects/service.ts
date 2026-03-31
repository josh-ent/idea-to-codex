import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { bootstrapRepository, validateRepository } from "../artifacts/repository.js";
import { getRepositoryState, initializeGitRepository } from "../artifacts/git.js";

interface WorkspaceState {
  active_project_path: string | null;
  known_project_paths: string[];
}

export interface ProjectSummary {
  name: string;
  path: string;
  is_git_repository: boolean;
  is_active: boolean;
}

export interface ProjectWorkspace {
  active_project: ProjectSummary | null;
  known_projects: ProjectSummary[];
}

export interface CreateProjectInput {
  project_name: string;
  project_path: string;
  initialize_git?: boolean;
}

export interface ProjectServiceOptions {
  fallbackActiveProjectRoot?: string;
  stateDir?: string;
}

export async function getProjectWorkspace(
  studioRoot: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  const state = await readWorkspaceState(studioRoot, options);
  const activeProjectPath = normalizeActiveProjectPath(state, options.fallbackActiveProjectRoot);
  const knownProjectPaths = [
    ...new Set(
      [activeProjectPath, ...state.known_project_paths]
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const summaries = await Promise.all(
    knownProjectPaths.map((projectPath) =>
      toProjectSummary(projectPath, projectPath === activeProjectPath),
    ),
  );
  const knownProjects = summaries.filter((project): project is ProjectSummary => project !== null);
  const activeProject = knownProjects.find((project) => project.is_active) ?? null;

  if (needsWorkspaceRewrite(state, activeProject, knownProjects)) {
    await writeWorkspaceState(studioRoot, options, {
      active_project_path: activeProject?.path ?? null,
      known_project_paths: knownProjects.map((project) => project.path),
    });
  }

  return {
    active_project: activeProject,
    known_projects: knownProjects,
  };
}

export async function createProject(
  studioRoot: string,
  input: CreateProjectInput,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  const projectName = input.project_name.trim();
  const projectRoot = resolveProjectPath(studioRoot, input.project_path);

  if (!projectName) {
    throw new Error("project_name is required");
  }

  if (!input.project_path.trim()) {
    throw new Error("project_path is required");
  }

  if (await pathExists(projectRoot)) {
    const entries = await fs.readdir(projectRoot);

    if (entries.length > 0) {
      throw new Error(`project path already exists and is not empty: ${projectRoot}`);
    }
  } else {
    await fs.mkdir(projectRoot, { recursive: true });
  }

  await bootstrapRepository(projectRoot, { projectName });

  if (input.initialize_git !== false) {
    await initializeGitRepository(projectRoot);
  }

  await validateRepository(projectRoot);
  await persistWorkspaceProject(studioRoot, projectRoot, options);

  return getProjectWorkspace(studioRoot, options);
}

export async function openProject(
  studioRoot: string,
  projectPath: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  const resolvedProjectPath = resolveProjectPath(studioRoot, projectPath);
  const stats = await fs.stat(resolvedProjectPath).catch(() => null);

  if (!projectPath.trim()) {
    throw new Error("project_path is required");
  }

  if (!stats?.isDirectory()) {
    throw new Error(`project path does not exist: ${resolvedProjectPath}`);
  }

  await persistWorkspaceProject(studioRoot, resolvedProjectPath, options);

  return getProjectWorkspace(studioRoot, options);
}

function normalizeActiveProjectPath(
  state: WorkspaceState,
  fallbackActiveProjectRoot?: string,
): string | null {
  return state.active_project_path ?? fallbackActiveProjectRoot ?? null;
}

function needsWorkspaceRewrite(
  state: WorkspaceState,
  activeProject: ProjectSummary | null,
  knownProjects: ProjectSummary[],
): boolean {
  if (state.active_project_path !== (activeProject?.path ?? null)) {
    return true;
  }

  const knownPaths = knownProjects.map((project) => project.path);

  return (
    state.known_project_paths.length !== knownPaths.length ||
    state.known_project_paths.some((projectPath, index) => projectPath !== knownPaths[index])
  );
}

async function persistWorkspaceProject(
  studioRoot: string,
  projectRoot: string,
  options: ProjectServiceOptions,
): Promise<void> {
  const state = await readWorkspaceState(studioRoot, options);
  const knownProjectPaths = [
    projectRoot,
    ...state.known_project_paths.filter((candidate) => candidate !== projectRoot),
  ];

  await writeWorkspaceState(studioRoot, options, {
    active_project_path: projectRoot,
    known_project_paths: knownProjectPaths,
  });
}

async function readWorkspaceState(
  studioRoot: string,
  options: ProjectServiceOptions,
): Promise<WorkspaceState> {
  const statePath = workspaceStatePath(studioRoot, options);

  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;

    return {
      active_project_path:
        typeof parsed.active_project_path === "string" ? parsed.active_project_path : null,
      known_project_paths: Array.isArray(parsed.known_project_paths)
        ? parsed.known_project_paths.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        active_project_path: null,
        known_project_paths: [],
      };
    }

    throw error;
  }
}

async function writeWorkspaceState(
  studioRoot: string,
  options: ProjectServiceOptions,
  state: WorkspaceState,
): Promise<void> {
  const statePath = workspaceStatePath(studioRoot, options);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function workspaceStatePath(studioRoot: string, options: ProjectServiceOptions): string {
  const stateDir = options.stateDir
    ? path.resolve(options.stateDir)
    : process.env.IDEA_TO_CODEX_STATE_DIR
      ? path.resolve(process.env.IDEA_TO_CODEX_STATE_DIR)
      : path.join(os.homedir(), ".idea-to-codex");

  return path.join(stateDir, workspaceStateFileName(studioRoot));
}

function workspaceStateFileName(studioRoot: string): string {
  const studioName = path.basename(studioRoot) || "studio";
  return `${studioName}-workspace.json`;
}

function resolveProjectPath(studioRoot: string, projectPath: string): string {
  return path.resolve(studioRoot, projectPath);
}

async function toProjectSummary(
  projectPath: string,
  isActive: boolean,
): Promise<ProjectSummary | null> {
  const stats = await fs.stat(projectPath).catch(() => null);

  if (!stats?.isDirectory()) {
    return null;
  }

  const repositoryState = await getRepositoryState(projectPath);

  return {
    name: path.basename(projectPath),
    path: projectPath,
    is_git_repository: repositoryState.available,
    is_active: isActive,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
