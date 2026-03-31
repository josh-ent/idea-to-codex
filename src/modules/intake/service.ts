import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { createHash } from "node:crypto";

import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { createLogger, logOperation } from "../../runtime/logging.js";
import { workflowQuestionTypes } from "../governance/workflow.js";
import { parseStructuredTextWithOpenAI } from "../llm/openai.js";
import { IntakeError } from "./errors.js";

const logger = createLogger("intake");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export const intakeSchemaVersion = 2;
export const intakePromptVersion = "2026-03-31.1";
const intakeLane = "broad_reasoning" as const;
const intakeProvider = "openai" as const;
const defaultConfiguredModel =
  process.env.OPENAI_INTAKE_MODEL ??
  process.env.OPENAI_BROAD_REASONING_MODEL ??
  "gpt-5.2-chat-latest";
const defaultTimeoutMs = 60_000;
const perSourceContextByteLimit = 8_000;
const totalContextByteLimit = 32_000;
const optionalContextSourcePaths = [
  "PROJECT_AIMS.md",
  "ARCHITECTURE.md",
  "GLOSSARY.md",
  "PLAN.md",
  "DATA_DICTIONARY.md",
  "ASSUMPTIONS.md",
  "RISKS.md",
  "BACKLOG.md",
] as const;

export const intakeQuestionTypes = [
  ...workflowQuestionTypes,
  "terminology_integrity",
  "data_definition_integrity",
  "architecture_direction",
  "governance_posture",
  "handoff_quality",
  "bounded_change",
] as const;

export type IntakeQuestionType = (typeof intakeQuestionTypes)[number];

export interface IntakeQuestion {
  id: IntakeQuestionType;
  display_id: string;
  type: IntakeQuestionType;
  blocking: boolean;
  default_recommendation: string;
  consequence_of_non_decision: string;
  affected_artifacts: string[];
  status: "open";
  prompt: string;
}

export interface IntakeContextSourceUsed {
  path: string;
  content_hash: string;
  truncated: boolean;
}

export interface IntakeContextSourceIssue {
  path: string;
  reason: string;
}

export interface IntakeAnalysisMetadata {
  provider: typeof intakeProvider;
  lane: typeof intakeLane;
  configured_model: string;
  resolved_model: string | null;
  schema_version: typeof intakeSchemaVersion;
  prompt_version: typeof intakePromptVersion;
  canonical_project_root: string;
  request_hash: string;
  context_hash: string;
  analysis_hash: string;
  duration_ms: number;
  context_sources_used: IntakeContextSourceUsed[];
  context_sources_missing: IntakeContextSourceIssue[];
  context_sources_invalid: IntakeContextSourceIssue[];
  context_truncated: boolean;
}

export interface IntakeAnalysis {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  material_questions: IntakeQuestion[];
  draft_assumptions: string[];
  analysis_metadata: IntakeAnalysisMetadata;
}

interface IntakeQuestionDefinition {
  blocking: boolean;
  defaultRecommendation: string;
  consequenceOfNonDecision: string;
  affectedArtifacts: string[];
  prompt: string;
}

export interface IntakeModelOutput {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  question_types: IntakeQuestionType[];
  draft_assumptions: string[];
}

export interface IntakeAnalysisClient {
  analyze(input: {
    configuredModel: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<{
    output: IntakeModelOutput;
    resolvedModel: string | null;
  }>;
}

export interface IntakeAnalysisOptions {
  analysis?: unknown;
  client?: IntakeAnalysisClient;
  configuredModel?: string;
  timeoutMs?: number;
}

const questionTypeSchema = z.enum(intakeQuestionTypes);
const intakeModelOutputSchema = z
  .object({
    summary: z.string(),
    recommended_tranche_title: z.string(),
    affected_artifacts: z.array(z.string()),
    affected_modules: z.array(z.string()),
    question_types: z.array(questionTypeSchema),
    draft_assumptions: z.array(z.string()),
  })
  .strict();
const intakeQuestionSchema = z
  .object({
    id: questionTypeSchema,
    display_id: z.string().regex(/^Q-\d{3}$/),
    type: questionTypeSchema,
    blocking: z.boolean(),
    default_recommendation: z.string(),
    consequence_of_non_decision: z.string(),
    affected_artifacts: z.array(z.string()),
    status: z.literal("open"),
    prompt: z.string(),
  })
  .strict();
const intakeAnalysisSchema = z
  .object({
    summary: z.string(),
    recommended_tranche_title: z.string(),
    affected_artifacts: z.array(z.string()),
    affected_modules: z.array(z.string()),
    material_questions: z.array(intakeQuestionSchema),
    draft_assumptions: z.array(z.string()),
    analysis_metadata: z
      .object({
        provider: z.literal(intakeProvider),
        lane: z.literal(intakeLane),
        configured_model: z.string(),
        resolved_model: z.string().nullable(),
        schema_version: z.literal(intakeSchemaVersion),
        prompt_version: z.literal(intakePromptVersion),
        canonical_project_root: z.string(),
        request_hash: z.string(),
        context_hash: z.string(),
        analysis_hash: z.string(),
        duration_ms: z.number().int().nonnegative(),
        context_sources_used: z.array(
          z
            .object({
              path: z.string(),
              content_hash: z.string(),
              truncated: z.boolean(),
            })
            .strict(),
        ),
        context_sources_missing: z.array(
          z
            .object({
              path: z.string(),
              reason: z.string(),
            })
            .strict(),
        ),
        context_sources_invalid: z.array(
          z
            .object({
              path: z.string(),
              reason: z.string(),
            })
            .strict(),
        ),
        context_truncated: z.boolean(),
      })
      .strict(),
  })
  .strict();

const questionRegistry: Record<IntakeQuestionType, IntakeQuestionDefinition> = {
  workflow_actor: {
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "PLAN.md", "BACKLOG.md"],
    defaultRecommendation:
      "Name the Actor explicitly so workflow critique stays tied to the real participant rather than an abstract user.",
    consequenceOfNonDecision:
      "Workflow critique will stay ambiguous because the real participant is undefined.",
    prompt: "Which Actor is this workflow or Use Case for?",
  },
  workflow_use_case: {
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "PLAN.md", "BACKLOG.md"],
    defaultRecommendation:
      "Name the Use Case explicitly so critique stays attached to one real task instead of a vague workflow area.",
    consequenceOfNonDecision:
      "Workflow critique will stay broad because the intended Use Case is undefined.",
    prompt: "What named Use Case or workflow is being changed or critiqued?",
  },
  workflow_goal: {
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "PLAN.md", "BACKLOG.md"],
    defaultRecommendation:
      "State the Actor goal in task terms so the system can judge whether the workflow serves it.",
    consequenceOfNonDecision:
      "The system cannot tell whether the workflow helps the Actor succeed or just moves data around.",
    prompt: "What goal is the Actor trying to achieve in this Use Case?",
  },
  workflow_constraints: {
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "PLAN.md", "BACKLOG.md"],
    defaultRecommendation:
      "List the workflow constraints explicitly so critique can weigh the tradeoffs against the Actor goal.",
    consequenceOfNonDecision:
      "The system may critique the workflow without knowing the rules or tradeoffs it must respect.",
    prompt:
      "What constraints must this Use Case respect? Separate multiple constraints with new lines or semicolons.",
  },
  terminology_integrity: {
    blocking: true,
    affectedArtifacts: ["GLOSSARY.md", "DATA_DICTIONARY.md"],
    defaultRecommendation:
      "Update the glossary and data dictionary before implementation work spreads the new term.",
    consequenceOfNonDecision:
      "Terminology will drift across docs, prompts, and UI copy.",
    prompt:
      "Which term is changing, what is its canonical replacement, and which older synonyms should be treated as deprecated?",
  },
  data_definition_integrity: {
    blocking: true,
    affectedArtifacts: ["DATA_DICTIONARY.md", "ARCHITECTURE.md"],
    defaultRecommendation:
      "Define or update the data dictionary entry before adding new write paths or prompts.",
    consequenceOfNonDecision:
      "Package generation and validation will rely on undefined or inconsistent data meaning.",
    prompt:
      "What field or entity meaning needs to become canonical, and what constraints or allowed values matter?",
  },
  architecture_direction: {
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "docs/decisions/"],
    defaultRecommendation:
      "Capture the architecture choice in a decision record if it changes module ownership or boundaries.",
    consequenceOfNonDecision:
      "Implementation may proceed on an implicit design choice that is expensive to reverse.",
    prompt:
      "What architecture boundary or ownership decision is changing, and which modules are affected?",
  },
  governance_posture: {
    blocking: true,
    affectedArtifacts: ["RISKS.md", "ASSUMPTIONS.md", "PLAN.md"],
    defaultRecommendation:
      "Record the constraint before automating the affected workflow.",
    consequenceOfNonDecision:
      "The platform could automate a flow that violates the intended governance posture.",
    prompt:
      "What governance or approval constraint must the system respect before continuing?",
  },
  handoff_quality: {
    blocking: false,
    affectedArtifacts: ["prompts/templates/plan-package.md", "prompts/templates/execution-package.md"],
    defaultRecommendation:
      "Keep the handoff shape tranche-scoped and derived from validated repository truth.",
    consequenceOfNonDecision:
      "Codex handoffs may become weaker or more ambiguous without obvious breakage.",
    prompt: "What aspect of the plan or execution package needs to become more explicit for Codex?",
  },
  bounded_change: {
    blocking: false,
    affectedArtifacts: ["PLAN.md", "BACKLOG.md"],
    defaultRecommendation:
      "Treat the request as a bounded change inside the current architecture until stronger evidence appears.",
    consequenceOfNonDecision:
      "The request may move forward without surfacing deeper product or architecture implications.",
    prompt:
      "What outcome should this change produce, and which current tranche or workflow does it belong to?",
  },
};

interface LoadedContextSource {
  path: string;
  content: string;
  truncated: boolean;
}

interface LoadedContext {
  canonicalProjectRoot: string;
  contextHash: string;
  contextSourcesUsed: IntakeContextSourceUsed[];
  contextSourcesMissing: IntakeContextSourceIssue[];
  contextSourcesInvalid: IntakeContextSourceIssue[];
  contextTruncated: boolean;
  promptContext: string;
}

const systemInstructions = [
  "You analyze repository-backed intake requests for a product planning system.",
  "Return only bounded analysis fields. Do not return full question objects.",
  "Choose question_types only from the provided enum.",
  "Do not emit duplicate question types.",
  "Only include bounded_change when no more specific question types are required.",
  "Use affected_artifacts and affected_modules as advisory bounded-analysis fields only.",
  "Keep the response concise, structured, and grounded in the provided request and repository context.",
].join("\n");

export async function analyzeRequest(
  rootDir: string,
  requestText: string,
  options: IntakeAnalysisOptions = {},
): Promise<IntakeAnalysis> {
  return logOperation(
    logger,
    "analyze intake request",
    async () => {
      const normalizedRequest = normalizeRequestText(requestText);
      const requestHash = hashText(normalizedRequest);
      const configuredModel = options.configuredModel?.trim() || defaultConfiguredModel;
      const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
      const loadedContext = await loadContext(rootDir);
      const client = options.client ?? createDefaultClient();
      const prompt = buildPrompt(normalizedRequest, loadedContext);
      const startedAt = Date.now();

      try {
        const result = await client.analyze({
          configuredModel,
          prompt,
          timeoutMs,
        });
        return finalizeAnalysis({
          canonicalProjectRoot: loadedContext.canonicalProjectRoot,
          configuredModel,
          contextHash: loadedContext.contextHash,
          contextMetadata: loadedContext,
          durationMs: Date.now() - startedAt,
          normalizedRequest,
          rawOutput: result.output,
          requestHash,
          resolvedModel: result.resolvedModel,
        });
      } catch (error) {
        throw mapProviderError(error);
      }
    },
    {
      fields: {
        request_length: requestText.trim().length,
        root_dir: rootDir,
      },
      summarizeResult: (analysis) => ({
        context_hash: analysis.analysis_metadata.context_hash,
        material_question_count: analysis.material_questions.length,
        model: analysis.analysis_metadata.resolved_model ?? analysis.analysis_metadata.configured_model,
        request_hash: analysis.analysis_metadata.request_hash,
      }),
    },
  );
}

export async function resolveIntakeAnalysis(
  rootDir: string,
  requestText: string,
  options: IntakeAnalysisOptions = {},
): Promise<IntakeAnalysis> {
  if (options.analysis === undefined) {
    return analyzeRequest(rootDir, requestText, options);
  }

  return validateSuppliedAnalysis(rootDir, requestText, options.analysis);
}

export function normalizeRequestText(requestText: string): string {
  return requestText.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}

function createDefaultClient(): IntakeAnalysisClient {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new IntakeError(
      "llm_not_configured",
      "OpenAI intake analysis is not configured. Set OPENAI_API_KEY before running intake analysis.",
    );
  }

  return {
    async analyze(input) {
      const response = await parseStructuredTextWithOpenAI<z.infer<typeof intakeModelOutputSchema>>({
        apiKey,
        configuredModel: input.configuredModel,
        instructions: systemInstructions,
        prompt: input.prompt,
        responseFormat: zodTextFormat(intakeModelOutputSchema, "intake_analysis"),
        timeoutMs: input.timeoutMs,
      });

      if (response.parsed) {
        return {
          output: response.parsed,
          resolvedModel: response.resolvedModel,
        };
      }

      throw new IntakeError(
        "model_refusal",
        response.refusal?.trim() || "The intake model refused to analyze this request.",
      );
    },
  };
}

async function loadContext(rootDir: string): Promise<LoadedContext> {
  const canonicalProjectRoot = await resolveCanonicalProjectRoot(rootDir);
  const contextSourcesMissing: IntakeContextSourceIssue[] = [];
  const contextSourcesInvalid: IntakeContextSourceIssue[] = [];
  const usedSources: LoadedContextSource[] = [];
  let remainingBytes = totalContextByteLimit;
  let contextTruncated = false;

  for (const relativePath of optionalContextSourcePaths) {
    const absolutePath = path.join(canonicalProjectRoot, relativePath);
    let sourceText: string;

    try {
      const bytes = await fs.readFile(absolutePath);
      sourceText = normalizeContextText(utf8Decoder.decode(bytes));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        contextSourcesMissing.push({
          path: relativePath,
          reason: "missing",
        });
        continue;
      }

      if (error instanceof TypeError) {
        contextSourcesInvalid.push({
          path: relativePath,
          reason: "invalid_utf8",
        });
        continue;
      }

      if (code) {
        contextSourcesMissing.push({
          path: relativePath,
          reason: code.toLowerCase(),
        });
        continue;
      }

      throw new IntakeError("context_load_failure", `Failed to load intake context from ${relativePath}.`, {
        details: {
          canonical_project_root: canonicalProjectRoot,
          source_path: relativePath,
        },
        retryable: false,
      });
    }

    const perSource = truncateUtf8(sourceText, perSourceContextByteLimit);
    const withinBudget = truncateUtf8(perSource.content, remainingBytes);
    remainingBytes = Math.max(0, remainingBytes - byteLength(withinBudget.content));
    contextTruncated = contextTruncated || perSource.truncated || withinBudget.truncated;
    usedSources.push({
      path: relativePath,
      content: withinBudget.content,
      truncated: perSource.truncated || withinBudget.truncated,
    });
  }

  const serializedContext = JSON.stringify({
    canonical_project_root: canonicalProjectRoot,
    sources: usedSources.map((source) => ({
      content: source.content,
      path: source.path,
    })),
  });

  return {
    canonicalProjectRoot,
    contextHash: hashText(serializedContext),
    contextSourcesInvalid,
    contextSourcesMissing,
    contextSourcesUsed: usedSources.map((source) => ({
      path: source.path,
      content_hash: hashText(source.content),
      truncated: source.truncated,
    })),
    contextTruncated,
    promptContext: usedSources
      .map((source) => `## ${source.path}\n${source.content || "(empty)"}`)
      .join("\n\n"),
  };
}

async function resolveCanonicalProjectRoot(rootDir: string): Promise<string> {
  const resolvedRoot = path.resolve(rootDir);

  try {
    await fs.access(resolvedRoot);
    return await fs.realpath(resolvedRoot);
  } catch {
    throw new IntakeError(
      "context_load_failure",
      `The active project root is not readable: ${resolvedRoot}`,
      {
        details: {
          requested_root: rootDir,
          resolved_root: resolvedRoot,
        },
        retryable: false,
      },
    );
  }
}

function buildPrompt(requestText: string, context: LoadedContext): string {
  return [
    `Schema version: ${intakeSchemaVersion}`,
    `Prompt version: ${intakePromptVersion}`,
    `Canonical project root: ${context.canonicalProjectRoot}`,
    "",
    "Question type enum:",
    ...intakeQuestionTypes.map((questionType) => `- ${questionType}`),
    "",
    "Request:",
    requestText || "(empty request)",
    "",
    "Repository context:",
    context.promptContext || "(no optional context available)",
  ].join("\n");
}

function finalizeAnalysis(input: {
  canonicalProjectRoot: string;
  configuredModel: string;
  contextHash: string;
  contextMetadata: LoadedContext;
  durationMs: number;
  normalizedRequest: string;
  rawOutput: IntakeModelOutput;
  requestHash: string;
  resolvedModel: string | null;
}): IntakeAnalysis {
  const parsedOutput = intakeModelOutputSchema.safeParse(input.rawOutput);

  if (!parsedOutput.success) {
    throw new IntakeError(
      "invalid_structured_output",
      "The intake model returned an invalid structured response.",
      {
        details: {
          issues: parsedOutput.error.issues.map((issue) => issue.message),
        },
      },
    );
  }

  const normalizedBody = buildCanonicalAnalysisBody(parsedOutput.data);
  const analysisHash = computeAnalysisHash({
    canonicalProjectRoot: input.canonicalProjectRoot,
    contextHash: input.contextHash,
    normalizedBody,
    promptVersion: intakePromptVersion,
    requestHash: input.requestHash,
    schemaVersion: intakeSchemaVersion,
  });
  const analysis = validateCanonicalAnalysis({
    ...normalizedBody,
    analysis_metadata: {
      provider: intakeProvider,
      lane: intakeLane,
      configured_model: input.configuredModel,
      resolved_model: input.resolvedModel,
      schema_version: intakeSchemaVersion,
      prompt_version: intakePromptVersion,
      canonical_project_root: input.canonicalProjectRoot,
      request_hash: input.requestHash,
      context_hash: input.contextHash,
      analysis_hash: analysisHash,
      duration_ms: input.durationMs,
      context_sources_used: input.contextMetadata.contextSourcesUsed,
      context_sources_missing: input.contextMetadata.contextSourcesMissing,
      context_sources_invalid: input.contextMetadata.contextSourcesInvalid,
      context_truncated: input.contextMetadata.contextTruncated,
    },
  });

  logger.debug("intake analysis finalized", {
    analysis_hash: analysis.analysis_metadata.analysis_hash,
    canonical_project_root: analysis.analysis_metadata.canonical_project_root,
    configured_model: analysis.analysis_metadata.configured_model,
    context_hash: analysis.analysis_metadata.context_hash,
    context_truncated: analysis.analysis_metadata.context_truncated,
    question_types: analysis.material_questions.map((question) => question.type),
    request_hash: analysis.analysis_metadata.request_hash,
    resolved_model: analysis.analysis_metadata.resolved_model,
  });

  return analysis;
}

async function validateSuppliedAnalysis(
  rootDir: string,
  requestText: string,
  suppliedAnalysis: unknown,
): Promise<IntakeAnalysis> {
  return logOperation(
    logger,
    "validate supplied intake analysis",
    async () => {
      const normalizedRequest = normalizeRequestText(requestText);
      const requestHash = hashText(normalizedRequest);
      const context = await loadContext(rootDir);
      const analysis = validateCanonicalAnalysis(suppliedAnalysis);

      if (analysis.analysis_metadata.request_hash !== requestHash) {
        throw new IntakeError(
          "analysis_request_mismatch",
          "The supplied intake analysis does not match the current request.",
        );
      }

      if (analysis.analysis_metadata.canonical_project_root !== context.canonicalProjectRoot) {
        throw new IntakeError(
          "analysis_project_mismatch",
          "The supplied intake analysis was produced for a different project root.",
        );
      }

      if (analysis.analysis_metadata.context_hash !== context.contextHash) {
        throw new IntakeError(
          "analysis_context_mismatch",
          "The supplied intake analysis does not match the current project context.",
        );
      }

      if (analysis.analysis_metadata.schema_version !== intakeSchemaVersion) {
        throw new IntakeError(
          "analysis_schema_version_mismatch",
          "The supplied intake analysis uses an unsupported schema version.",
        );
      }

      if (analysis.analysis_metadata.prompt_version !== intakePromptVersion) {
        throw new IntakeError(
          "analysis_prompt_version_mismatch",
          "The supplied intake analysis uses a different prompt version.",
        );
      }

      const expectedHash = computeAnalysisHash({
        canonicalProjectRoot: context.canonicalProjectRoot,
        contextHash: context.contextHash,
        normalizedBody: extractCanonicalAnalysisBody(analysis),
        promptVersion: intakePromptVersion,
        requestHash,
        schemaVersion: intakeSchemaVersion,
      });

      if (analysis.analysis_metadata.analysis_hash !== expectedHash) {
        throw new IntakeError(
          "analysis_hash_mismatch",
          "The supplied intake analysis failed integrity validation.",
        );
      }

      return analysis;
    },
    {
      fields: {
        root_dir: rootDir,
      },
      startLevel: "debug",
      successLevel: "debug",
    },
  );
}

function buildCanonicalAnalysisBody(rawOutput: IntakeModelOutput): Omit<IntakeAnalysis, "analysis_metadata"> {
  const questionTypes = normalizeQuestionTypes(rawOutput.question_types);
  const materialQuestions = questionTypes.map((type, index) => {
    const definition = questionRegistry[type];

    return {
      id: type,
      display_id: `Q-${String(index + 1).padStart(3, "0")}`,
      type,
      blocking: definition.blocking,
      default_recommendation: definition.defaultRecommendation,
      consequence_of_non_decision: definition.consequenceOfNonDecision,
      affected_artifacts: [...definition.affectedArtifacts],
      status: "open" as const,
      prompt: definition.prompt,
    };
  });

  const summary = normalizeSingleLine(rawOutput.summary) || "No request provided.";
  const recommendedTrancheTitle =
    normalizeSingleLine(rawOutput.recommended_tranche_title) || "Refine Project Intent";

  return {
    summary,
    recommended_tranche_title: recommendedTrancheTitle,
    affected_artifacts: normalizeStringList(rawOutput.affected_artifacts),
    affected_modules: normalizeStringList(rawOutput.affected_modules),
    material_questions: materialQuestions,
    draft_assumptions: normalizeStringList(rawOutput.draft_assumptions),
  };
}

function validateCanonicalAnalysis(value: unknown): IntakeAnalysis {
  const parsed = intakeAnalysisSchema.safeParse(value);

  if (!parsed.success) {
    throw new IntakeError(
      "contract_violation",
      "The intake analysis contract is invalid.",
      {
        details: {
          issues: parsed.error.issues.map((issue) => issue.message),
        },
      },
    );
  }

  const analysis = parsed.data;
  const expectedQuestionTypes = normalizeQuestionTypes(
    analysis.material_questions.map((question) => question.type),
  );
  const expectedQuestions = buildCanonicalAnalysisBody({
    summary: analysis.summary,
    recommended_tranche_title: analysis.recommended_tranche_title,
    affected_artifacts: analysis.affected_artifacts,
    affected_modules: analysis.affected_modules,
    question_types: expectedQuestionTypes,
    draft_assumptions: analysis.draft_assumptions,
  }).material_questions;

  if (JSON.stringify(analysis.material_questions) !== JSON.stringify(expectedQuestions)) {
    throw new IntakeError(
      "contract_violation",
      "The intake analysis question set is not canonical.",
    );
  }

  return analysis;
}

function normalizeQuestionTypes(questionTypes: IntakeQuestionType[]): IntakeQuestionType[] {
  const uniqueTypes = new Set<IntakeQuestionType>();

  for (const questionType of questionTypes) {
    if (uniqueTypes.has(questionType)) {
      throw new IntakeError(
        "contract_violation",
        `The intake analysis returned duplicate question type ${questionType}.`,
      );
    }

    uniqueTypes.add(questionType);
  }

  const specificTypes = [...uniqueTypes].filter((type) => type !== "bounded_change");
  const normalizedTypes = new Set<IntakeQuestionType>();
  const hasWorkflowQuestion = specificTypes.some((type) =>
    workflowQuestionTypes.includes(type as (typeof workflowQuestionTypes)[number]),
  );

  if (hasWorkflowQuestion) {
    for (const workflowType of workflowQuestionTypes) {
      normalizedTypes.add(workflowType);
    }
  }

  for (const questionType of specificTypes) {
    if (!workflowQuestionTypes.includes(questionType as (typeof workflowQuestionTypes)[number])) {
      normalizedTypes.add(questionType);
    }
  }

  if (normalizedTypes.size === 0) {
    normalizedTypes.add("bounded_change");
  }

  return intakeQuestionTypes.filter((questionType) => normalizedTypes.has(questionType));
}

function normalizeSingleLine(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)[0]
    ?.trim() ?? "";
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeListValue(value)).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function normalizeListValue(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeContextText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function truncateUtf8(value: string, maxBytes: number): { content: string; truncated: boolean } {
  if (maxBytes <= 0) {
    return {
      content: "",
      truncated: value.length > 0,
    };
  }

  if (byteLength(value) <= maxBytes) {
    return {
      content: value,
      truncated: false,
    };
  }

  let truncated = value;

  while (truncated.length > 0 && byteLength(truncated) > maxBytes) {
    truncated = truncated.slice(0, -1);
  }

  return {
    content: truncated,
    truncated: true,
  };
}

function extractCanonicalAnalysisBody(
  analysis: IntakeAnalysis,
): Omit<IntakeAnalysis, "analysis_metadata"> {
  return {
    summary: analysis.summary,
    recommended_tranche_title: analysis.recommended_tranche_title,
    affected_artifacts: [...analysis.affected_artifacts],
    affected_modules: [...analysis.affected_modules],
    material_questions: analysis.material_questions.map((question) => ({
      ...question,
      affected_artifacts: [...question.affected_artifacts],
    })),
    draft_assumptions: [...analysis.draft_assumptions],
  };
}

function computeAnalysisHash(input: {
  canonicalProjectRoot: string;
  contextHash: string;
  normalizedBody: Omit<IntakeAnalysis, "analysis_metadata">;
  promptVersion: string;
  requestHash: string;
  schemaVersion: number;
}): string {
  return hashText(
    JSON.stringify({
      analysis: input.normalizedBody,
      canonical_project_root: input.canonicalProjectRoot,
      context_hash: input.contextHash,
      prompt_version: input.promptVersion,
      request_hash: input.requestHash,
      schema_version: input.schemaVersion,
    }),
  );
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }

  const configured = Number.parseInt(process.env.OPENAI_RESPONSES_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultTimeoutMs;
}

function mapProviderError(error: unknown): Error {
  if (error instanceof IntakeError) {
    return error;
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new IntakeError("provider_timeout", "The intake model request timed out.");
  }

  if (error instanceof APIConnectionError) {
    return new IntakeError(
      "provider_unavailable",
      "The intake model provider is unavailable or the network request failed.",
    );
  }

  if (error instanceof APIError) {
    return new IntakeError(
      "provider_unavailable",
      error.message || "The intake model provider returned an API error.",
    );
  }

  return error instanceof Error ? error : new Error("unknown intake analysis failure");
}
