import os from "node:os";
import path from "node:path";

export function resolveStateDir(explicitStateDir?: string): string {
  return explicitStateDir
    ? path.resolve(explicitStateDir)
    : process.env.IDEA_TO_CODEX_STATE_DIR
      ? path.resolve(process.env.IDEA_TO_CODEX_STATE_DIR)
      : path.join(os.homedir(), ".idea-to-codex");
}

export function loggingDatabasePath(explicitStateDir?: string): string {
  return process.env.IDEA_TO_CODEX_LOG_DB_PATH?.trim()
    ? path.resolve(process.env.IDEA_TO_CODEX_LOG_DB_PATH)
    : path.join(resolveStateDir(explicitStateDir), "logs.sqlite");
}

export function workspaceStatePath(studioRoot: string, explicitStateDir?: string): string {
  return path.join(resolveStateDir(explicitStateDir), workspaceStateFileName(studioRoot));
}

function workspaceStateFileName(studioRoot: string): string {
  const studioName = path.basename(studioRoot) || "studio";
  return `${studioName}-workspace.json`;
}
