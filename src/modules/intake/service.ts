const analysisRules = [
  {
    type: "workflow_semantics",
    keywords: ["ui", "workflow", "screen", "page", "journey", "operator", "frontend"],
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "PLAN.md", "BACKLOG.md"],
    affectedModules: ["ui"],
    defaultRecommendation:
      "Keep the interaction task-oriented and route durable writes through the backend.",
    consequenceOfNonDecision:
      "The operator console may optimize for the system rather than the operator's real task.",
    prompt:
      "Which operator task or workflow needs to improve, and what should stay explicitly out of scope?",
  },
  {
    type: "terminology_integrity",
    keywords: ["term", "glossary", "rename", "vocabulary", "wording", "label"],
    blocking: true,
    affectedArtifacts: ["GLOSSARY.md", "DATA_DICTIONARY.md"],
    affectedModules: ["artifacts", "governance"],
    defaultRecommendation:
      "Update the glossary and data dictionary before implementation work spreads the new term.",
    consequenceOfNonDecision:
      "Terminology will drift across docs, prompts, and UI copy.",
    prompt:
      "Which term is changing, what is its canonical replacement, and which older synonyms should be treated as deprecated?",
  },
  {
    type: "data_definition_integrity",
    keywords: ["field", "data", "schema", "entity", "attribute", "dictionary"],
    blocking: true,
    affectedArtifacts: ["DATA_DICTIONARY.md", "ARCHITECTURE.md"],
    affectedModules: ["artifacts", "governance"],
    defaultRecommendation:
      "Define or update the data dictionary entry before adding new write paths or prompts.",
    consequenceOfNonDecision:
      "Package generation and validation will rely on undefined or inconsistent data meaning.",
    prompt:
      "What field or entity meaning needs to become canonical, and what constraints or allowed values matter?",
  },
  {
    type: "architecture_direction",
    keywords: ["architecture", "module", "backend", "frontend", "service", "api", "design"],
    blocking: true,
    affectedArtifacts: ["ARCHITECTURE.md", "docs/decisions/"],
    affectedModules: ["artifacts", "packaging", "server", "ui"],
    defaultRecommendation:
      "Capture the architecture choice in a decision record if it changes module ownership or boundaries.",
    consequenceOfNonDecision:
      "Implementation may proceed on an implicit design choice that is expensive to reverse.",
    prompt:
      "What architecture boundary or ownership decision is changing, and which modules are affected?",
  },
  {
    type: "governance_posture",
    keywords: ["risk", "privacy", "security", "compliance", "approval", "governance"],
    blocking: true,
    affectedArtifacts: ["RISKS.md", "ASSUMPTIONS.md", "PLAN.md"],
    affectedModules: ["governance", "server"],
    defaultRecommendation:
      "Record the constraint before automating the affected workflow.",
    consequenceOfNonDecision:
      "The platform could automate a flow that violates the intended governance posture.",
    prompt:
      "What governance or approval constraint must the system respect before continuing?",
  },
  {
    type: "handoff_quality",
    keywords: ["package", "prompt", "codex", "plan", "execution", "handoff"],
    blocking: false,
    affectedArtifacts: ["prompts/templates/plan-package.md", "prompts/templates/execution-package.md"],
    affectedModules: ["packaging"],
    defaultRecommendation:
      "Keep the handoff shape tranche-scoped and derived from validated repository truth.",
    consequenceOfNonDecision:
      "Codex handoffs may become weaker or more ambiguous without obvious breakage.",
    prompt:
      "What aspect of the plan or execution package needs to become more explicit for Codex?",
  },
] as const;

export interface IntakeQuestion {
  id: string;
  type: string;
  blocking: boolean;
  default_recommendation: string;
  consequence_of_non_decision: string;
  affected_artifacts: string[];
  status: "open";
  prompt: string;
}

export interface IntakeAnalysis {
  summary: string;
  recommended_tranche_title: string;
  affected_artifacts: string[];
  affected_modules: string[];
  material_questions: IntakeQuestion[];
  draft_assumptions: string[];
}

export function analyzeRequest(requestText: string): IntakeAnalysis {
  const normalized = requestText.trim();
  const lowered = normalized.toLowerCase();
  const matchedRules = analysisRules.filter((rule) =>
    rule.keywords.some((keyword) => lowered.includes(keyword)),
  );
  const effectiveRules = matchedRules.length > 0 ? matchedRules : [defaultRule];

  return {
    summary: summarizeRequest(normalized),
    recommended_tranche_title: recommendTrancheTitle(normalized),
    affected_artifacts: unique(
      effectiveRules.flatMap((rule) => rule.affectedArtifacts),
    ),
    affected_modules: unique(
      effectiveRules.flatMap((rule) => rule.affectedModules),
    ),
    material_questions: effectiveRules.map((rule, index) => ({
      id: `Q-${String(index + 1).padStart(3, "0")}`,
      type: rule.type,
      blocking: rule.blocking,
      default_recommendation: rule.defaultRecommendation,
      consequence_of_non_decision: rule.consequenceOfNonDecision,
      affected_artifacts: [...rule.affectedArtifacts],
      status: "open",
      prompt: rule.prompt,
    })),
    draft_assumptions:
      matchedRules.length > 0
        ? []
        : [
            "Proceed under the current architecture and glossary unless the request explicitly changes them.",
          ],
  };
}

function summarizeRequest(requestText: string): string {
  if (!requestText) {
    return "No request provided.";
  }

  return requestText.split(/\n+/)[0]?.trim() || requestText.trim();
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

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

const defaultRule = {
  type: "bounded_change",
  keywords: [],
  blocking: false,
  affectedArtifacts: ["PLAN.md", "BACKLOG.md"],
  affectedModules: ["intake"],
  defaultRecommendation:
    "Treat the request as a bounded change inside the current architecture until stronger evidence appears.",
  consequenceOfNonDecision:
    "The request may move forward without surfacing deeper product or architecture implications.",
  prompt:
    "What outcome should this change produce, and which current tranche or workflow does it belong to?",
} as const;
