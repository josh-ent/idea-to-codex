import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createLogger, logOperation, summarizeError } from "../../runtime/logging.js";

const execFileAsync = promisify(execFile);
const logger = createLogger("artifacts.git");

export interface RepositoryState {
  available: boolean;
  branch: string | null;
  head: string | null;
  dirty_paths: string[];
  is_dirty: boolean;
  is_main_branch: boolean;
}

export async function getRepositoryState(rootDir: string): Promise<RepositoryState> {
  return logOperation(
    logger,
    "read repository state",
    async () => {
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
    },
    {
      fields: {
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (repositoryState) => ({
        available: repositoryState.available,
        branch: repositoryState.branch,
        dirty_path_count: repositoryState.dirty_paths.length,
        head: repositoryState.head,
        is_dirty: repositoryState.is_dirty,
        is_main_branch: repositoryState.is_main_branch,
      }),
    },
  );
}

export async function initializeGitRepository(rootDir: string): Promise<void> {
  await logOperation(
    logger,
    "initialize git repository",
    async () => {
      if (!(await isGitRepository(rootDir))) {
        await runGit(rootDir, ["init", "-b", "main"]);
      }

      await ensureGitIdentity(rootDir);
      await runGit(rootDir, ["add", "."]);

      const status = await readGitOrNull(rootDir, ["status", "--short"]);

      if (status) {
        await runGit(rootDir, [
          "-c",
          "commit.gpgSign=false",
          "commit",
          "-m",
          "Bootstrap project repository",
        ]);
      }
    },
    {
      fields: {
        root_dir: rootDir,
      },
    },
  );
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
  } catch (error) {
    logger.trace("git command returned no value", {
      args,
      root_dir: rootDir,
      ...summarizeError(error),
    });
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
    logger.debug("running git command", {
      args,
      root_dir: rootDir,
    });
    await execFileAsync("git", ["-C", rootDir, ...args]);
  } catch (error) {
    logger.error("git command failed", {
      args,
      root_dir: rootDir,
      ...summarizeError(error),
    });
    throw new Error(
      `git command failed in ${rootDir}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
