/** @vitest-environment jsdom */
/// <reference path="../web/src/shims-vue.d.ts" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
// @ts-expect-error The UI tests must use the web app's Pinia singleton, not the root package copy.
import { createPinia, setActivePinia, type Pinia } from "../web/node_modules/pinia/dist/pinia.mjs";
// @ts-expect-error The UI tests must use the web app's Vue runtime, not the root package copy.
import { nextTick } from "../web/node_modules/vue/index.mjs";

import type {
  IntakeAnalysis,
  IntakeQuestionType,
} from "../src/modules/intake/contract.js";
import type { StatusPayload } from "../web/src/api/console.js";

const { getJsonMock, postJsonMock } = vi.hoisted(() => ({
  getJsonMock: vi.fn(),
  postJsonMock: vi.fn(),
}));

vi.mock("../web/src/api/console.ts", async () => {
  const actual = await vi.importActual<typeof import("../web/src/api/console.ts")>(
    "../web/src/api/console.ts",
  );

  return {
    ...actual,
    getJson: getJsonMock,
    postJson: postJsonMock,
  };
});

import App from "../web/src/App.vue";
import IntakeSection from "../web/src/components/console/IntakeSection.vue";
import { useConsoleStore } from "../web/src/stores/console.js";

let pinia: Pinia;

function buildQuestion(type: IntakeQuestionType, index: number) {
  return {
    id: type,
    display_id: `Q-${String(index + 1).padStart(3, "0")}`,
    type,
    blocking:
      type !== "bounded_change" && type !== "handoff_quality",
    default_recommendation: `Default recommendation for ${type}.`,
    consequence_of_non_decision: `Consequence for ${type}.`,
    affected_artifacts: ["PLAN.md"],
    status: "open" as const,
    prompt: `Prompt for ${type}.`,
  };
}

function buildAnalysis(questionTypes: IntakeQuestionType[]): IntakeAnalysis {
  return {
    summary: "Fixture intake summary.",
    recommended_tranche_title: "Fixture Tranche",
    affected_artifacts: ["PLAN.md"],
    affected_modules: ["intake"],
    material_questions: questionTypes.map(buildQuestion),
    draft_assumptions: [],
    analysis_metadata: {
      provider: "openai",
      lane: "broad_reasoning",
      configured_model: "gpt-5.2-chat-latest",
      resolved_model: "gpt-5.2-chat-latest-stub",
      schema_version: 2,
      prompt_version: "2026-03-31.1",
      canonical_project_root: "/fixture/project",
      request_hash: "request-hash",
      context_hash: "context-hash",
      analysis_hash: "analysis-hash",
      duration_ms: 10,
      context_sources_used: [],
      context_sources_missing: [],
      context_sources_invalid: [],
      context_truncated: false,
    },
  };
}

function buildStatusPayload(): StatusPayload {
  return {
    project: {
      active_project: {
        name: "fixture-project",
        path: "/fixture/project",
        is_git_repository: true,
        is_active: true,
      },
      known_projects: [],
    },
    llm_usage: {
      total_tokens: 18222,
      openai_tokens: 15360,
      codex_tokens: 2862,
    },
    repository_state: {
      available: true,
      branch: "main",
      head: "abcdef1234567890",
      dirty_paths: [],
      is_dirty: false,
      is_main_branch: true,
    },
    validation: {
      rootFiles: [],
      directories: [],
      decisions: [],
      proposalSets: [],
      proposalDrafts: [],
      tranches: [],
      reviews: [],
      planPackages: [],
      executionPackages: [],
      assumptions: [],
      glossaryTerms: [],
      openQuestions: [],
      traceLinks: [],
    },
    errors: [],
  };
}

function mountApp() {
  return mount(App, {
    global: {
      plugins: [pinia],
      stubs: {
        Message: {
          template: '<div class="message"><slot /></div>',
        },
        OverviewSection: {
          template: "<div />",
        },
        IntakeSection: {
          template: "<div />",
        },
        ProposalSection: {
          template: "<div />",
        },
        PackageSection: {
          template: "<div />",
        },
        ReviewSection: {
          template: "<div />",
        },
      },
    },
  });
}

function mountIntakeSection() {
  return mount(IntakeSection, {
    global: {
      plugins: [pinia],
      stubs: {
        Button: {
          props: ["disabled", "label"],
          template: '<button :disabled="disabled">{{ label }}</button>',
        },
        Tag: {
          props: ["value"],
          template: '<span class="tag">{{ value }}</span>',
        },
      },
    },
  });
}

describe("console ui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it("retains answers only for stable question ids across fresh analyses", async () => {
    const store = useConsoleStore();
    const firstAnalysis = buildAnalysis([
      "terminology_integrity",
      "architecture_direction",
    ]);
    const secondAnalysis = buildAnalysis(["terminology_integrity"]);

    postJsonMock
      .mockResolvedValueOnce(firstAnalysis)
      .mockResolvedValueOnce(secondAnalysis);

    store.intakeRequest = "Rename the glossary term and adjust architecture.";
    await store.analyzeIntakeRequest();
    store.setIntakeAnswer("terminology_integrity", "Canonical replacement: `Proposal Draft`.");
    store.setIntakeAnswer("architecture_direction", "The backend owns truth mutation.");

    await store.analyzeIntakeRequest();

    expect(store.intakeAnswers).toEqual({
      terminology_integrity: "Canonical replacement: `Proposal Draft`.",
    });
  });

  it("marks analysis stale only when the normalized request meaning changes", async () => {
    const store = useConsoleStore();

    postJsonMock.mockResolvedValueOnce(buildAnalysis(["terminology_integrity"]));

    store.intakeRequest = "Rename the glossary term.";
    await store.analyzeIntakeRequest();

    store.intakeRequest = "  Rename the glossary term.\n\n";
    await nextTick();
    expect(store.intakeAnalysisStale).toBe(false);

    store.intakeRequest = "Rename the glossary term everywhere.";
    await nextTick();
    expect(store.intakeAnalysisStale).toBe(true);
  });

  it("renders mismatch errors with explicit re-run guidance", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.lastError = "The supplied intake analysis does not match the current project context.";
    store.lastErrorCode = "analysis_context_mismatch";
    store.lastErrorRetryable = false;

    const wrapper = mountApp();

    expect(wrapper.text()).toContain(
      "The supplied intake analysis does not match the current project context.",
    );
    expect(wrapper.text()).toContain(
      "Re-run intake analysis before generating proposals.",
    );
  });

  it("renders retryable errors with explicit retry guidance", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.lastError = "The intake provider timed out.";
    store.lastErrorCode = "provider_timeout";
    store.lastErrorRetryable = true;

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("The intake provider timed out.");
    expect(wrapper.text()).toContain("You can retry this action.");
  });

  it("renders active-project token metrics in the left rail", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.status = buildStatusPayload();

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Total tokens");
    expect(wrapper.text()).toContain("18,222");
    expect(wrapper.text()).toContain("15,360");
    expect(wrapper.text()).toContain("2,862");
  });

  it("renders non-retryable errors without extra retry guidance", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.lastError = "The intake analysis contract is invalid.";
    store.lastErrorCode = "contract_violation";
    store.lastErrorRetryable = false;

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("The intake analysis contract is invalid.");
    expect(wrapper.text()).not.toContain("You can retry this action.");
    expect(wrapper.text()).not.toContain("Re-run intake analysis before generating proposals.");
  });

  it("shows stale-analysis messaging and blocks proposal generation while stale", async () => {
    const store = useConsoleStore();
    store.status = buildStatusPayload();
    store.intakeRequest = "Rename the glossary term.";
    store.intakeAnalysis = buildAnalysis(["terminology_integrity"]);
    store.intakeAnswers = {
      terminology_integrity: "Canonical replacement: `Proposal Draft`.",
    };
    store.intakeAnalysisStale = true;

    const wrapper = mountIntakeSection();
    const generateButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Generate proposal set");

    expect(store.canGenerateIntakeProposalSet).toBe(false);
    expect(wrapper.text()).toContain(
      "Re-run analysis before proposal generation because the request changed.",
    );
    expect(generateButton?.attributes("disabled")).toBeDefined();
  });
});
