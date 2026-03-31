import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createLogger, logOperation } from "../../runtime/logging.js";
import { workspaceStatePath as runtimeWorkspaceStatePath } from "../../runtime/state-paths.js";
import { bootstrapRepository, validateRepository } from "../artifacts/repository.js";
import { getRepositoryState, initializeGitRepository } from "../artifacts/git.js";

const execFileAsync = promisify(execFile);
const logger = createLogger("projects");

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
  selectDirectory?: (input: SelectDirectoryInput) => Promise<string | null>;
}

export interface SelectDirectoryInput {
  initial_path?: string;
  dialog_title?: string;
}

export async function getProjectWorkspace(
  studioRoot: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  return logOperation(
    logger,
    "load project workspace",
    async () => {
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
        logger.debug("rewriting workspace state", {
          active_project_path: activeProject?.path ?? null,
          known_project_paths: knownProjects.map((project) => project.path),
        });
        await writeWorkspaceState(studioRoot, options, {
          active_project_path: activeProject?.path ?? null,
          known_project_paths: knownProjects.map((project) => project.path),
        });
      }

      return {
        active_project: activeProject,
        known_projects: knownProjects,
      };
    },
    {
      fields: {
        fallback_active_project_root: options.fallbackActiveProjectRoot,
        studio_root: studioRoot,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (workspace) => ({
        active_project_path: workspace.active_project?.path ?? null,
        known_project_count: workspace.known_projects.length,
      }),
    },
  );
}

export async function createProject(
  studioRoot: string,
  input: CreateProjectInput,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  return logOperation(
    logger,
    "create project",
    async () => {
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
    },
    {
      fields: {
        initialize_git: input.initialize_git !== false,
        project_name: input.project_name.trim(),
        project_path: input.project_path.trim(),
        studio_root: studioRoot,
      },
      summarizeResult: (workspace) => ({
        active_project_path: workspace.active_project?.path ?? null,
        known_project_count: workspace.known_projects.length,
      }),
    },
  );
}

export async function openProject(
  studioRoot: string,
  projectPath: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectWorkspace> {
  return logOperation(
    logger,
    "open project",
    async () => {
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
    },
    {
      fields: {
        project_path: projectPath.trim(),
        studio_root: studioRoot,
      },
      summarizeResult: (workspace) => ({
        active_project_path: workspace.active_project?.path ?? null,
        known_project_count: workspace.known_projects.length,
      }),
    },
  );
}

export async function selectProjectDirectory(
  studioRoot: string,
  input: SelectDirectoryInput,
  options: ProjectServiceOptions = {},
): Promise<string | null> {
  return logOperation(
    logger,
    "select project directory",
    async () => {
      const initialPath = resolveInitialDirectory(studioRoot, input.initial_path);

      if (options.selectDirectory) {
        return options.selectDirectory({
          initial_path: initialPath,
          dialog_title: input.dialog_title,
        });
      }

      return openNativeDirectoryDialog({
        initial_path: initialPath,
        dialog_title: input.dialog_title ?? "Select project folder",
      });
    },
    {
      fields: {
        dialog_title: input.dialog_title,
        initial_path: input.initial_path,
        studio_root: studioRoot,
      },
      startLevel: "debug",
      successLevel: "info",
      summarizeResult: (selectedPath) => ({
        selected_path: selectedPath,
      }),
    },
  );
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
  logger.debug("persisted workspace project", {
    active_project_path: projectRoot,
    known_project_count: knownProjectPaths.length,
    studio_root: studioRoot,
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
  return runtimeWorkspaceStatePath(studioRoot, options.stateDir);
}

function resolveProjectPath(studioRoot: string, projectPath: string): string {
  return path.resolve(studioRoot, projectPath);
}

function resolveInitialDirectory(studioRoot: string, projectPath?: string): string | undefined {
  if (!projectPath?.trim()) {
    return studioRoot;
  }

  const resolvedPath = resolveProjectPath(studioRoot, projectPath);
  return resolvedPath;
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

async function openNativeDirectoryDialog(input: {
  initial_path?: string;
  dialog_title: string;
}): Promise<string | null> {
  if (process.platform === "darwin") {
    return selectDirectoryWithAppleScript(input);
  }

  if (process.platform === "win32") {
    return selectDirectoryWithPowerShell(input);
  }

  return selectDirectoryWithZenity(input);
}

async function selectDirectoryWithZenity(input: {
  initial_path?: string;
  dialog_title: string;
}): Promise<string | null> {
  const args = ["--file-selection", "--directory", "--title", input.dialog_title];

  if (input.initial_path) {
    args.push("--filename", ensureTrailingSeparator(input.initial_path));
  }

  try {
    const { stdout } = await execFileAsync("zenity", args);
    return normalizeSelectedDirectory(stdout);
  } catch (error) {
    if (isDialogCancelled(error)) {
      return null;
    }

    throw new Error("directory selection dialog failed");
  }
}

async function selectDirectoryWithAppleScript(input: {
  initial_path?: string;
  dialog_title: string;
}): Promise<string | null> {
  const args = ["-e", appleScriptForDirectorySelection(input)];

  try {
    const { stdout } = await execFileAsync("osascript", args);
    return normalizeSelectedDirectory(stdout);
  } catch (error) {
    if (isDialogCancelled(error)) {
      return null;
    }

    throw new Error("directory selection dialog failed");
  }
}

async function selectDirectoryWithPowerShell(input: {
  initial_path?: string;
  dialog_title: string;
}): Promise<string | null> {
  const command = powerShellForDirectorySelection(input);

  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ]);
    return normalizeSelectedDirectory(stdout);
  } catch (error) {
    if (isDialogCancelled(error)) {
      return null;
    }

    throw new Error("directory selection dialog failed");
  }
}

function normalizeSelectedDirectory(stdout: string): string | null {
  const selectedPath = stdout.trim();
  return selectedPath ? selectedPath : null;
}

function isDialogCancelled(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException & { code?: string | number }).code;
  return String(code) === "1";
}

function ensureTrailingSeparator(targetPath: string): string {
  return targetPath.endsWith(path.sep) ? targetPath : `${targetPath}${path.sep}`;
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function escapePowerShellString(value: string): string {
  return value.replaceAll("'", "''");
}

function appleScriptForDirectorySelection(input: {
  initial_path?: string;
  dialog_title: string;
}): string {
  const prompt = escapeAppleScriptString(input.dialog_title);
  const initialLocation = input.initial_path
    ? ` default location POSIX file "${escapeAppleScriptString(input.initial_path)}"`
    : "";

  return `try
set selectedFolder to choose folder with prompt "${prompt}"${initialLocation}
POSIX path of selectedFolder
on error number -128
return ""
end try`;
}

function powerShellForDirectorySelection(input: {
  initial_path?: string;
  dialog_title: string;
}): string {
  const description = escapePowerShellString(input.dialog_title);
  const selectedPath = input.initial_path
    ? escapePowerShellString(input.initial_path)
    : "";

  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${description}'`,
    "$dialog.UseDescriptionForTitle = $true",
    selectedPath ? `$dialog.SelectedPath = '${selectedPath}'` : "",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  Write-Output $dialog.SelectedPath",
    "}",
  ]
    .filter(Boolean)
    .join("; ");
}
