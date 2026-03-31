/** @vitest-environment jsdom */
/// <reference path="../web/src/shims-vue.d.ts" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
// @ts-expect-error The UI tests must use the web app's Pinia singleton, not the root package copy.
import { createPinia, setActivePinia, type Pinia } from "../web/node_modules/pinia/dist/pinia.mjs";

import type { IntakeSessionPayload } from "../src/modules/intake/session-contract.js";
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

function buildStatusPayload(): StatusPayload {
  return {
    feature_flags: {
      intake_sessions_v1: true,
      proposal_llm_v1: false,
    },
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

function buildQuestion(id: string, index: number, answerText = "") {
  return {
    id,
    session_id: "INTAKE-001",
    origin_turn_id: "TURN-001",
    current_prompt: `Prompt for ${id}.`,
    current_rationale_markdown: `Rationale for ${id}.`,
    importance: index === 0 ? ("high" as const) : ("medium" as const),
    tags: index === 0 ? ["scope", "risk"] : ["constraints"],
    status: answerText ? ("answered" as const) : ("open" as const),
    current_display_order: index + 1,
    answer_text: answerText || null,
    answer_updated_at: answerText ? "2026-03-31T10:00:00.000Z" : null,
    superseded_by_question_id: null,
    session_revision_seen: 2,
    updated_at: "2026-03-31T10:00:00.000Z",
  };
}

function buildSessionPayload(options: {
  briefEntryProvenance?: string | null;
  questions?: ReturnType<typeof buildQuestion>[];
  sessionRevision?: number;
  status?: IntakeSessionPayload["session"]["status"];
} = {}): IntakeSessionPayload {
  const sessionId = "INTAKE-001";
  const briefVersionId = "BRIEF-001";
  const sessionRevision = options.sessionRevision ?? 2;
  const questions = options.questions ?? [
    buildQuestion("question-1", 0, "Keep the architecture stable."),
    buildQuestion("question-2", 1, ""),
  ];

  return {
    session: {
      id: sessionId,
      scope_key: "/fixture/project::main::/fixture/project/.git",
      project_root: "/fixture/project",
      branch_name: "main",
      worktree_id: "/fixture/project/.git",
      scope_fallback_mode: "project_branch_worktree",
      status: options.status ?? "active",
      current_brief_version_id: briefVersionId,
      session_revision: sessionRevision,
      created_at: "2026-03-31T09:59:00.000Z",
      updated_at: "2026-03-31T10:00:00.000Z",
      finalized_at: null,
      abandoned_at: null,
    },
    request_text: "Clarify the current intake brief.",
    current_brief: {
      id: briefVersionId,
      session_id: sessionId,
      brief_version_number: 1,
      created_from_turn_id: "TURN-001",
      status: "draft",
      rendered_markdown: "Project brief snapshot.",
      created_at: "2026-03-31T10:00:00.000Z",
    },
    current_brief_entries: [
      {
        id: "ENTRY-001",
        brief_version_id: briefVersionId,
        entry_type: "problem_statement",
        position: 1,
        value_json: JSON.stringify({ text: "The project needs a tighter intake brief." }),
        rendered_markdown: "The project needs a tighter intake brief.",
        provenance_summary: options.briefEntryProvenance ?? "llm_inferred: Intake brief synthesized by the model",
      },
    ],
    questions,
    question_lineage_summary: [
      {
        id: "LINEAGE-001",
        session_id: sessionId,
        turn_id: "TURN-001",
        from_question_id: "question-1",
        to_question_id: null,
        relation_type: "retained_as",
      },
    ],
    session_revision: sessionRevision,
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
          props: ["disabled", "label", "loading"],
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

  it("loads the active intake session and keeps question answers keyed by stable ids", async () => {
    const store = useConsoleStore();
    store.status = buildStatusPayload();
    const session = buildSessionPayload();
    getJsonMock.mockResolvedValueOnce(session);

    await store.loadActiveIntakeSession();

    expect(getJsonMock).toHaveBeenCalledWith("/api/intake/active");
    expect(store.intakeSession?.session.id).toBe("INTAKE-001");
    expect(store.intakeQuestionAnswers).toEqual({
      "question-1": "Keep the architecture stable.",
      "question-2": "",
    });
  });

  it("sends stable question ids when continuing an intake session", async () => {
    const store = useConsoleStore();
    store.status = buildStatusPayload();
    store.intakeSession = buildSessionPayload();
    store.intakeQuestionAnswers = {
      "question-1": "Keep the architecture stable.",
      "question-2": "",
    };
    store.setIntakeQuestionAnswer("question-2", "Need a clearer constraint boundary.");
    store.intakeOperatorNotes = "Confirm scope before finalising.";

    const nextSession = buildSessionPayload({ sessionRevision: 3 });
    postJsonMock.mockResolvedValueOnce(nextSession);

    await store.continueIntakeSession();

    expect(postJsonMock).toHaveBeenCalledWith("/api/intake/sessions/INTAKE-001/continue", {
      expected_session_revision: 2,
      operator_notes: "Confirm scope before finalising.",
      question_answers: {
        "question-1": "Keep the architecture stable.",
        "question-2": "Need a clearer constraint boundary.",
      },
    });
    expect(store.intakeSession?.session_revision).toBe(3);
    expect(store.intakeQuestionAnswers).toEqual({
      "question-1": "Keep the architecture stable.",
      "question-2": "",
    });
  });

  it("renders the session workspace compactly and keeps finalise available", async () => {
    const store = useConsoleStore();
    store.status = buildStatusPayload();
    store.intakeSession = buildSessionPayload({
      questions: [
        buildQuestion("question-1", 0, ""),
        buildQuestion("question-2", 1, "Answered on the initial turn."),
      ],
    });

    const wrapper = mountIntakeSection();

    expect(wrapper.text()).toContain("Continue intake");
    expect(wrapper.text()).toContain("Finalise intake");
    expect(wrapper.text()).toContain("Abandon");
    expect(wrapper.text()).toContain("Provenance: llm_inferred: Intake brief synthesized by the model");
    expect(wrapper.text()).toContain("Prompt for question-1.");
    expect(wrapper.text()).toContain("Lineage:");
    expect(wrapper.text()).toContain("retained as");
    expect(wrapper.text()).not.toContain("Generate proposal set");

    const finaliseButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Finalise intake");

    expect(finaliseButton?.attributes("disabled")).toBeUndefined();
  });

  it("renders the active-project token metrics in the left rail", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.status = buildStatusPayload();

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("Total tokens");
    expect(wrapper.text()).toContain("18,222");
    expect(wrapper.text()).toContain("15,360");
    expect(wrapper.text()).toContain("2,862");
  });

  it("renders intake-session conflict guidance", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.lastError = "The intake session changed in another window.";
    store.lastErrorCode = "intake_session_conflict";
    store.lastErrorRetryable = false;

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("The intake session changed in another window.");
    expect(wrapper.text()).toContain("Reload the intake session and try again.");
  });

  it("renders non-retryable errors without retry guidance", async () => {
    const store = useConsoleStore();
    store.refreshWorkspace = vi.fn(async () => {});
    store.lastError = "The intake contract is invalid.";
    store.lastErrorCode = "contract_violation";
    store.lastErrorRetryable = false;

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("The intake contract is invalid.");
    expect(wrapper.text()).not.toContain("You can retry this action.");
    expect(wrapper.text()).not.toContain("Reload the intake session and try again.");
  });
});
