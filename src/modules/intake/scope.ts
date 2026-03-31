import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { constants as fsConstants } from "node:fs";

import { createLogger, logOperation, summarizeError } from "../../runtime/logging.js";
import { IntakeError } from "./errors.js";
import type { IntakeScope } from "./session-contract.js";

const execFileAsync = promisify(execFile);
const logger = createLogger("intake.scope");

export async function resolveIntakeScope(rootDir: string): Promise<IntakeScope> {
  return logOperation(
    logger,
    "resolve intake scope",
    async () => {
      const projectRoot = await resolveCanonicalProjectRoot(rootDir);
      const branchName = await readGitOrNull(projectRoot, ["branch", "--show-current"]);
      const worktreeId = await readWorktreeId(projectRoot);

      if (worktreeId) {
        return {
          scope_key: `${projectRoot}::${branchName ?? "-" }::${worktreeId}`,
          project_root: projectRoot,
          branch_name: branchName,
          worktree_id: worktreeId,
          scope_fallback_mode: "project_branch_worktree",
        };
      }

      if (branchName) {
        return {
          scope_key: `${projectRoot}::${branchName}`,
          project_root: projectRoot,
          branch_name: branchName,
          worktree_id: null,
          scope_fallback_mode: "project_branch",
        };
      }

      return {
        scope_key: projectRoot,
        project_root: projectRoot,
        branch_name: null,
        worktree_id: null,
        scope_fallback_mode: "project_only",
      };
    },
    {
      fields: {
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
      summarizeResult: (scope) => ({
        branch_name: scope.branch_name,
        scope_fallback_mode: scope.scope_fallback_mode,
        scope_key: scope.scope_key,
        worktree_id: scope.worktree_id,
      }),
    },
  );
}

async function resolveCanonicalProjectRoot(rootDir: string): Promise<string> {
  const resolvedRoot = path.resolve(rootDir);
  let canonicalProjectRoot: string;

  try {
    canonicalProjectRoot = await fs.realpath(resolvedRoot);
  } catch {
    throw new IntakeError("context_load_failure", `The active project root is not readable: ${resolvedRoot}`, {
      details: {
        requested_root: rootDir,
        resolved_root: resolvedRoot,
      },
      retryable: false,
    });
  }

  let stats;

  try {
    stats = await fs.stat(canonicalProjectRoot);
  } catch {
    throw new IntakeError("context_load_failure", `The active project root is not readable: ${resolvedRoot}`, {
      details: {
        canonical_project_root: canonicalProjectRoot,
        requested_root: rootDir,
        resolved_root: resolvedRoot,
      },
      retryable: false,
    });
  }

  if (!stats.isDirectory()) {
    throw new IntakeError("context_load_failure", `The active project root is not a directory: ${canonicalProjectRoot}`, {
      details: {
        canonical_project_root: canonicalProjectRoot,
        requested_root: rootDir,
        resolved_root: resolvedRoot,
      },
      retryable: false,
    });
  }

  try {
    await fs.access(canonicalProjectRoot, fsConstants.R_OK);
  } catch {
    throw new IntakeError("context_load_failure", `The active project root is not readable: ${resolvedRoot}`, {
      details: {
        canonical_project_root: canonicalProjectRoot,
        requested_root: rootDir,
        resolved_root: resolvedRoot,
      },
      retryable: false,
    });
  }

  return canonicalProjectRoot;
}

async function readWorktreeId(rootDir: string): Promise<string | null> {
  const gitDir = await readGitOrNull(rootDir, ["rev-parse", "--git-dir"]);

  if (!gitDir) {
    return null;
  }

  const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(rootDir, gitDir);

  try {
    return await fs.realpath(absoluteGitDir);
  } catch {
    return path.resolve(absoluteGitDir);
  }
}

async function readGitOrNull(rootDir: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootDir, ...args]);
    const value = stdout.trim();
    return value ? value : null;
  } catch (error) {
    logger.trace("git command returned no intake scope value", {
      args,
      root_dir: rootDir,
      ...summarizeError(error),
    });
    return null;
  }
}
