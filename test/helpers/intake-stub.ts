import type {
  IntakeAnalysis,
  IntakeModelOutput,
} from "../../src/modules/intake/contract.js";
import type { IntakeAnalysisClient } from "../../src/modules/intake/service.js";

export function createStubIntakeClient(
  resolver: (requestText: string) => IntakeModelOutput = defaultStubModelOutput,
  options: {
    onAnalyzeInput?: (input: {
      canonicalProjectRoot: string;
      configuredModel: string;
      lane: string;
      prompt: string;
      timeoutMs: number;
    }) => void;
  } = {},
): IntakeAnalysisClient {
  return {
    async analyze(input) {
      options.onAnalyzeInput?.(input);
      return {
        output: resolver(readRequestFromPrompt(input.prompt)),
        resolvedModel: `${input.configuredModel}-stub`,
      };
    },
  };
}

export function defaultStubModelOutput(requestText: string): IntakeModelOutput {
  const normalized = requestText.trim();
  const lowered = normalized.toLowerCase();
  const questionTypes = new Set<IntakeModelOutput["question_types"][number]>();
  const affectedArtifacts = new Set<string>();
  const affectedModules = new Set<string>();

  if (matchesAny(lowered, ["ui", "workflow", "screen", "page", "journey", "operator", "frontend"])) {
    questionTypes.add("workflow_actor");
    affectedArtifacts.add("ARCHITECTURE.md");
    affectedArtifacts.add("PLAN.md");
    affectedArtifacts.add("BACKLOG.md");
    affectedModules.add("ui");
  }

  if (matchesAny(lowered, ["term", "glossary", "rename", "vocabulary", "wording", "label"])) {
    questionTypes.add("terminology_integrity");
    affectedArtifacts.add("GLOSSARY.md");
    affectedArtifacts.add("DATA_DICTIONARY.md");
    affectedModules.add("artifacts");
    affectedModules.add("governance");
  }

  if (matchesAny(lowered, ["field", "data", "schema", "entity", "attribute", "dictionary"])) {
    questionTypes.add("data_definition_integrity");
    affectedArtifacts.add("DATA_DICTIONARY.md");
    affectedArtifacts.add("ARCHITECTURE.md");
    affectedModules.add("artifacts");
    affectedModules.add("governance");
  }

  if (matchesAny(lowered, ["architecture", "module", "backend", "frontend", "service", "api", "design"])) {
    questionTypes.add("architecture_direction");
    affectedArtifacts.add("ARCHITECTURE.md");
    affectedArtifacts.add("docs/decisions/");
    affectedModules.add("artifacts");
    affectedModules.add("packaging");
    affectedModules.add("server");
    affectedModules.add("ui");
  }

  if (matchesAny(lowered, ["risk", "privacy", "security", "compliance", "approval", "governance"])) {
    questionTypes.add("governance_posture");
    affectedArtifacts.add("RISKS.md");
    affectedArtifacts.add("ASSUMPTIONS.md");
    affectedArtifacts.add("PLAN.md");
    affectedModules.add("governance");
    affectedModules.add("server");
  }

  if (matchesAny(lowered, ["package", "prompt", "codex", "plan", "execution", "handoff"])) {
    questionTypes.add("handoff_quality");
    affectedArtifacts.add("prompts/templates/plan-package.md");
    affectedArtifacts.add("prompts/templates/execution-package.md");
    affectedModules.add("packaging");
  }

  if (questionTypes.size === 0) {
    questionTypes.add("bounded_change");
    affectedArtifacts.add("PLAN.md");
    affectedArtifacts.add("BACKLOG.md");
    affectedModules.add("intake");
  }

  return {
    summary: normalized.split(/\n+/)[0]?.trim() || "No request provided.",
    recommended_tranche_title: recommendTrancheTitle(normalized),
    affected_artifacts: [...affectedArtifacts],
    affected_modules: [...affectedModules],
    question_types: [...questionTypes],
    draft_assumptions:
      questionTypes.has("bounded_change") && questionTypes.size === 1
        ? [
            "Proceed under the current architecture and glossary unless the request explicitly changes them.",
          ]
        : [],
  };
}

export function writeAnalysisFileContent(analysis: IntakeAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}

function readRequestFromPrompt(prompt: string): string {
  const match = /\nRequest:\n([\s\S]*?)\n\nRepository context:\n/.exec(prompt);
  return match?.[1]?.trim() ?? "";
}

function matchesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function recommendTrancheTitle(requestText: string): string {
  const basis = requestText
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return basis || "Refine Project Intent";
}
