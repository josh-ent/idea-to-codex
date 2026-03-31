import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RepositoryState {
  available: boolean;
  branch: string | null;
  head: string | null;
  dirty_paths: string[];
  is_dirty: boolean;
  is_main_branch: boolean;
}

export async function getRepositoryState(rootDir: string): Promise<RepositoryState> {
  if (!(await isGitRepository(rootDir))) {
    return {
      available: false,
      branch: null,
      head: null,
      dirty_paths: [],
      is_dirty: false,
      is_main_branch: false,
    };
  }

  const [branch, head, dirtyPaths] = await Promise.all([
    readGitOrNull(rootDir, ["branch", "--show-current"]),
    readGitOrNull(rootDir, ["rev-parse", "--short", "HEAD"]),
    readDirtyPaths(rootDir),
  ]);

  return {
    available: true,
    branch,
    head,
    dirty_paths: dirtyPaths,
    is_dirty: dirtyPaths.length > 0,
    is_main_branch: branch === "main",
  };
}

export async function initializeGitRepository(rootDir: string): Promise<void> {
  if (!(await isGitRepository(rootDir))) {
    await runGit(rootDir, ["init", "-b", "main"]);
  }

  await ensureGitIdentity(rootDir);
  await runGit(rootDir, ["add", "."]);

  const status = await readGitOrNull(rootDir, ["status", "--short"]);

  if (status) {
    await runGit(rootDir, ["-c", "commit.gpgSign=false", "commit", "-m", "Bootstrap project repository"]);
  }
}

async function isGitRepository(rootDir: string): Promise<boolean> {
  const value = await readGitOrNull(rootDir, ["rev-parse", "--is-inside-work-tree"]);
  return value === "true";
}

async function readDirtyPaths(rootDir: string): Promise<string[]> {
  const status = await readGitOrNull(rootDir, ["status", "--short"]);

  if (!status) {
    return [];
  }

  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.replace(/^.{2}\s*/, "").trim())
    .filter(Boolean);
}

async function readGitOrNull(rootDir: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootDir, ...args]);
    const value = stdout.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

async function ensureGitIdentity(rootDir: string): Promise<void> {
  const userName = await readGitOrNull(rootDir, ["config", "user.name"]);
  const userEmail = await readGitOrNull(rootDir, ["config", "user.email"]);

  if (!userName) {
    await runGit(rootDir, ["config", "user.name", "Codex Studio"]);
  }

  if (!userEmail) {
    await runGit(rootDir, ["config", "user.email", "studio@local"]);
  }
}

async function runGit(rootDir: string, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", ["-C", rootDir, ...args]);
  } catch (error) {
    throw new Error(
      `git command failed in ${rootDir}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
