import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { intakeSessionOutputResponseFormatName } from "./session-contract.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface IntakeSessionPromptAssets {
  response_format_name: string;
  system_instructions: string;
  user_template: string;
}

let cachedAssetsPromise: Promise<IntakeSessionPromptAssets> | null = null;
let cachedPromptRootPromise: Promise<string> | null = null;

export async function loadIntakeSessionPromptAssets(): Promise<IntakeSessionPromptAssets> {
  cachedAssetsPromise ??= readAssets();
  return cachedAssetsPromise;
}

export function renderIntakeSessionPrompt(input: {
  branch_name: string | null;
  current_brief_entries_json: string;
  current_questions_json: string;
  operator_inputs_json: string;
  project_root: string;
  request_text: string;
  scope_fallback_mode: string;
  template: string;
  turn_kind: string;
  worktree_id: string | null;
}): string {
  return input.template.replace(/{{([a-z_]+)}}/g, (_match, key: string) => {
    switch (key) {
      case "branch_name":
        return input.branch_name ?? "(unknown)";
      case "current_brief_entries_json":
        return input.current_brief_entries_json;
      case "current_questions_json":
        return input.current_questions_json;
      case "operator_inputs_json":
        return input.operator_inputs_json;
      case "project_root":
        return input.project_root;
      case "request_text":
        return input.request_text;
      case "scope_fallback_mode":
        return input.scope_fallback_mode;
      case "turn_kind":
        return input.turn_kind;
      case "worktree_id":
        return input.worktree_id ?? "(unavailable)";
      default:
        throw new Error(`Unknown intake session prompt placeholder: ${key}`);
    }
  });
}

async function readAssets(): Promise<IntakeSessionPromptAssets> {
  const [system_instructions, user_template] = await Promise.all([
    readText("system.md"),
    readText("user.md"),
  ]);

  return {
    response_format_name: intakeSessionOutputResponseFormatName,
    system_instructions,
    user_template,
  };
}

async function readText(relativePath: string): Promise<string> {
  const promptRoot = await resolvePromptRoot();
  const absolutePath = path.join(promptRoot, relativePath);
  return normalizePromptText(await fs.readFile(absolutePath, "utf8"));
}

function normalizePromptText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

async function resolvePromptRoot(): Promise<string> {
  cachedPromptRootPromise ??= findPromptRoot();
  return cachedPromptRootPromise;
}

async function findPromptRoot(): Promise<string> {
  for (const startDir of [moduleDir, process.cwd()]) {
    const resolved = await findPromptRootFrom(startDir);

    if (resolved) {
      return resolved;
    }
  }

  throw new Error("Unable to locate prompts/intake/session relative to the Studio codebase.");
}

async function findPromptRootFrom(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "prompts", "intake", "session");

    try {
      const stats = await fs.stat(candidate);

      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // keep moving upward
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
