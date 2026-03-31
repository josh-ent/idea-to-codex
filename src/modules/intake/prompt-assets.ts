import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  intakeQuestionTypes,
  type IntakeQuestionType,
} from "./contract.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const fieldTypeSchema = z.enum(["string", "string_array", "question_type_array"]);
const outputSchemaFileSchema = z
  .object({
    response_format_name: z.string().min(1),
    fields: z.record(z.string(), fieldTypeSchema),
  })
  .strict();
const questionDefinitionSchema = z
  .object({
    blocking: z.boolean(),
    default_recommendation: z.string(),
    consequence_of_non_decision: z.string(),
    affected_artifacts: z.array(z.string()),
    prompt: z.string(),
  })
  .strict();

export interface IntakeQuestionDefinition {
  blocking: boolean;
  default_recommendation: string;
  consequence_of_non_decision: string;
  affected_artifacts: string[];
  prompt: string;
}

export interface IntakePromptAssets {
  analyze: {
    response_format_name: string;
    system_instructions: string;
    user_template: string;
  };
  question_registry: Record<IntakeQuestionType, IntakeQuestionDefinition>;
}

let cachedAssetsPromise: Promise<IntakePromptAssets> | null = null;
let cachedPromptRootDirPromise: Promise<string> | null = null;

export async function loadIntakePromptAssets(): Promise<IntakePromptAssets> {
  cachedAssetsPromise ??= readIntakePromptAssets();
  return cachedAssetsPromise;
}

export function buildIntakeModelOutputSchema(
  questionTypeSchema: z.ZodType<IntakeQuestionType>,
) {
  return z
    .object({
      summary: z.string(),
      recommended_tranche_title: z.string(),
      affected_artifacts: z.array(z.string()),
      affected_modules: z.array(z.string()),
      question_types: z.array(questionTypeSchema),
      draft_assumptions: z.array(z.string()),
    })
    .strict();
}

export function renderIntakeAnalyzePrompt(input: {
  canonical_project_root: string;
  context: string;
  prompt_version: string;
  request: string;
  schema_version: number;
  template: string;
}): string {
  return input.template.replace(/{{([a-z_]+)}}/g, (_match, key: string) => {
    switch (key) {
      case "canonical_project_root":
        return input.canonical_project_root;
      case "context":
        return input.context;
      case "prompt_version":
        return input.prompt_version;
      case "question_type_lines":
        return intakeQuestionTypes.map((questionType) => `- ${questionType}`).join("\n");
      case "request":
        return input.request;
      case "schema_version":
        return String(input.schema_version);
      default:
        throw new Error(`Unknown intake prompt placeholder: ${key}`);
    }
  });
}

async function readIntakePromptAssets(): Promise<IntakePromptAssets> {
  const [systemTemplate, userTemplate, outputSchemaContent, questionRegistryContent] =
    await Promise.all([
      readPromptText("analyze/system.md"),
      readPromptText("analyze/user.md"),
      readPromptText("analyze/output-schema.json"),
      readPromptText("question-registry.json"),
    ]);
  const outputSchema = outputSchemaFileSchema.parse(JSON.parse(outputSchemaContent));
  const questionRegistry = parseQuestionRegistry(JSON.parse(questionRegistryContent));

  validateOutputSchemaFields(outputSchema.fields);

  return {
    analyze: {
      response_format_name: outputSchema.response_format_name,
      system_instructions: systemTemplate,
      user_template: userTemplate,
    },
    question_registry: questionRegistry,
  };
}

async function readPromptText(relativePath: string): Promise<string> {
  const absolutePath = path.join(await resolvePromptRootDir(), relativePath);
  return normalizePromptText(await fs.readFile(absolutePath, "utf8"));
}

function normalizePromptText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function parseQuestionRegistry(value: unknown): Record<IntakeQuestionType, IntakeQuestionDefinition> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("prompts/intake/question-registry.json must contain an object.");
  }

  const entries = Object.entries(value);
  const keys = entries.map(([key]) => key).sort();
  const expectedKeys = [...intakeQuestionTypes].sort();

  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("prompts/intake/question-registry.json must define every intake question type exactly once.");
  }

  const registry = {} as Record<IntakeQuestionType, IntakeQuestionDefinition>;

  for (const questionType of intakeQuestionTypes) {
    registry[questionType] = questionDefinitionSchema.parse(
      (value as Record<string, unknown>)[questionType],
    );
  }

  return registry;
}

function validateOutputSchemaFields(fields: Record<string, z.infer<typeof fieldTypeSchema>>): void {
  const expectedFields = {
    summary: "string",
    recommended_tranche_title: "string",
    affected_artifacts: "string_array",
    affected_modules: "string_array",
    question_types: "question_type_array",
    draft_assumptions: "string_array",
  } satisfies Record<string, z.infer<typeof fieldTypeSchema>>;

  if (JSON.stringify(fields) !== JSON.stringify(expectedFields)) {
    throw new Error("prompts/intake/analyze/output-schema.json does not match the canonical intake model-output contract.");
  }
}

async function resolvePromptRootDir(): Promise<string> {
  cachedPromptRootDirPromise ??= findPromptRootDir();
  return cachedPromptRootDirPromise;
}

async function findPromptRootDir(): Promise<string> {
  for (const startDir of [moduleDir, process.cwd()]) {
    const resolved = await findPromptRootDirFrom(startDir);

    if (resolved) {
      return resolved;
    }
  }

  throw new Error("Unable to locate prompts/intake relative to the Studio codebase.");
}

async function findPromptRootDirFrom(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, "prompts", "intake");

    try {
      const stats = await fs.stat(candidate);

      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // Keep searching upward.
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
