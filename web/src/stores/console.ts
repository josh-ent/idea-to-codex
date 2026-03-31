import { computed, ref, type Ref } from "vue";
import { defineStore } from "pinia";
import {
  ApiError,
  type CreateProjectPayload,
  type DirectorySelectionPayload,
  getJson,
  type OpenProjectPayload,
  postJson,
  type IntakeSessionPayload,
  type PackagePayload,
  type PackageSetPayload,
  type ProposalMutationPayload,
  type ProposalSetPayload,
  type ProposalSetSummary,
  type ReviewPayload,
  type StatusPayload,
} from "../api/console.js";

const reviewPackageRefreshSignals = new Set([
  "package alignment drift detected",
  "workflow context not propagated into packages",
]);

export const useConsoleStore = defineStore("console", () => {
  const status = ref<StatusPayload | null>(null);
  const proposalSets = ref<ProposalSetSummary[]>([]);
  const selectedProposalSetId = ref("");
  const selectedProposalSet = ref<ProposalSetPayload | null>(null);
  const isLoading = ref(false);
  const isLoadingProposals = ref(false);
  const isGeneratingPackage = ref(false);
  const isRefreshingPackageSet = ref(false);
  const isGeneratingReview = ref(false);
  const isGeneratingProposal = ref(false);
  const isLoadingIntakeSession = ref(false);
  const isStartingIntakeSession = ref(false);
  const isContinuingIntakeSession = ref(false);
  const isFinalizingIntakeSession = ref(false);
  const isAbandoningIntakeSession = ref(false);
  const activeProposalMutationId = ref("");
  const packageType = ref<"plan" | "execution">("plan");
  const selectedTrancheId = ref<string>("");
  const generatedPackage = ref<PackagePayload | null>(null);
  const generatedPackageSet = ref<PackageSetPayload | null>(null);
  const generatedReview = ref<ReviewPayload | null>(null);
  const newProjectName = ref("");
  const newProjectPath = ref("");
  const existingProjectPath = ref("");
  const intakeRequest = ref("");
  const intakeOperatorNotes = ref("");
  const intakeFinalizeNote = ref("");
  const intakeSession = ref<IntakeSessionPayload | null>(null);
  const intakeQuestionAnswers = ref<Record<string, string>>({});
  const lastError = ref<string>("");
  const lastErrorCode = ref("");
  const lastErrorRetryable = ref(false);
  const isCreatingProject = ref(false);
  const isOpeningProject = ref(false);
  const isSelectingProjectPath = ref(false);

  async function loadStatus(options: { clearError?: boolean } = {}) {
    isLoading.value = true;

    if (options.clearError !== false) {
      lastError.value = "";
    }

    try {
      status.value = await getJson<StatusPayload>("/api/status");
      if (!status.value.project.active_project) {
        resetProjectScopedState();
      }
      ensureSelectedTranche();
    } catch (error) {
      setTaskError(error, "status request failed");
    } finally {
      isLoading.value = false;
    }
  }

  async function loadProposalQueue(options: { clearError?: boolean } = {}) {
    if (!status.value?.project.active_project) {
      proposalSets.value = [];
      selectedProposalSet.value = null;
      selectedProposalSetId.value = "";
      return;
    }

    isLoadingProposals.value = true;

    if (options.clearError !== false) {
      lastError.value = "";
    }

    try {
      proposalSets.value = await getJson<ProposalSetSummary[]>("/api/proposals");

      if (!selectedProposalSetId.value && proposalSets.value[0]?.id) {
        selectedProposalSetId.value = proposalSets.value[0].id;
      }

      if (selectedProposalSetId.value) {
        await loadProposalSet(selectedProposalSetId.value);
      } else {
        selectedProposalSet.value = null;
      }
    } catch (error) {
      setTaskError(error, "proposal queue request failed");
    } finally {
      isLoadingProposals.value = false;
    }
  }

  async function loadProposalSet(proposalSetId: string) {
    if (!status.value?.project.active_project) {
      selectedProposalSet.value = null;
      return;
    }

    if (!proposalSetId) {
      selectedProposalSet.value = null;
      return;
    }

    selectedProposalSetId.value = proposalSetId;
    lastError.value = "";

    try {
      selectedProposalSet.value = await getJson<ProposalSetPayload>(
        `/api/proposals/${proposalSetId}`,
      );
    } catch (error) {
      setTaskError(error, "proposal detail request failed");
    }
  }

  async function generateSelectedPackage() {
    const trancheId = requireSelectedTranche("Select a tranche before generating a package.");

    if (trancheId) {
      await generatePackageFor(packageType.value, trancheId);
    }
  }

  async function createManagedProject() {
    if (!newProjectName.value.trim()) {
      lastError.value = "Enter a project name before creating a new project.";
      return;
    }

    if (!newProjectPath.value.trim()) {
      lastError.value = "Enter a project path before creating a new project.";
      return;
    }

    await runTask(isCreatingProject, "project creation failed", async () => {
      await postJson<CreateProjectPayload>("/api/projects/create", {
        project_name: newProjectName.value,
        project_path: newProjectPath.value,
        initialize_git: true,
      });
      existingProjectPath.value = "";
      await refreshAfterProjectSwitch();
    });
  }

  async function openManagedProject() {
    if (!existingProjectPath.value.trim()) {
      lastError.value = "Enter a project path before opening a project.";
      return;
    }

    await runTask(isOpeningProject, "project open failed", async () => {
      await postJson<OpenProjectPayload>("/api/projects/open", {
        project_path: existingProjectPath.value,
      });
      await refreshAfterProjectSwitch();
    });
  }

  async function selectProjectDirectory(
    target: "new" | "existing",
    dialogTitle: string,
  ) {
    await runTask(isSelectingProjectPath, "directory selection failed", async () => {
      const initialPath =
        target === "new" ? newProjectPath.value : existingProjectPath.value;
      const payload = await postJson<DirectorySelectionPayload>(
        "/api/projects/select-directory",
        {
          initial_path: initialPath,
          dialog_title: dialogTitle,
        },
      );

      if (!payload.path) {
        return;
      }

      if (target === "new") {
        newProjectPath.value = payload.path;
        return;
      }

      existingProjectPath.value = payload.path;
    });
  }

  async function generatePackageFor(
    type: "plan" | "execution",
    trancheId: string,
  ) {
    await runTask(isGeneratingPackage, "package generation failed", async () => {
      generatedPackage.value = await postJson<PackagePayload>(
        `/api/packages/${type}/${trancheId}`,
        { persist: true },
      );
      generatedPackageSet.value = null;
      packageType.value = type;
      selectedTrancheId.value = trancheId;
      await loadStatus({ clearError: false });
    });
  }

  async function regeneratePackageFromReview(packageId: string, trancheId: string) {
    const type =
      packageId.startsWith("PLAN-")
        ? "plan"
        : packageId.startsWith("EXECUTION-")
          ? "execution"
          : null;

    if (!type) {
      lastError.value = `Unsupported package id: ${packageId}`;
      return;
    }

    await generatePackageFor(type, trancheId);
  }

  async function refreshSelectedPackageSet() {
    const trancheId = requireSelectedTranche(
      "Select a tranche before refreshing its package set.",
    );

    if (!trancheId) {
      return;
    }

    await runTask(isRefreshingPackageSet, "package refresh failed", async () => {
      generatedPackageSet.value = await postJson<PackageSetPayload>(
        `/api/package-sets/${trancheId}/refresh`,
        { persist: true },
      );
      generatedPackage.value = null;
      selectedTrancheId.value = trancheId;
      await loadStatus({ clearError: false });
    });
  }

  async function generateReviewCheckpoint() {
    const trancheId = requireSelectedTranche(
      "Select a tranche before generating a review checkpoint.",
    );

    if (!trancheId) {
      return;
    }

    await runTask(isGeneratingReview, "review generation failed", async () => {
      generatedReview.value = await postJson<ReviewPayload>(
        `/api/reviews/${trancheId}`,
        { persist: true },
      );
      selectedTrancheId.value = trancheId;
      await loadStatus({ clearError: false });
    });
  }

  async function loadActiveIntakeSession(options: { clearError?: boolean } = {}) {
    if (!status.value?.project.active_project || intakeSessionsEnabled.value === false) {
      resetIntakeState();
      return;
    }

    isLoadingIntakeSession.value = true;

    if (options.clearError !== false) {
      lastError.value = "";
    }

    try {
      const session = await getJson<IntakeSessionPayload | null>("/api/intake/active");
      intakeSession.value = session;
      intakeQuestionAnswers.value = readQuestionAnswers(session);
      if (!session) {
        intakeOperatorNotes.value = "";
        intakeFinalizeNote.value = "";
      }
    } catch (error) {
      setTaskError(error, "intake session request failed");
    } finally {
      isLoadingIntakeSession.value = false;
    }
  }

  async function startIntakeSession() {
    const requestText = intakeRequest.value.trim();

    if (!requestText) {
      lastError.value = "Enter a request before starting intake.";
      return;
    }

    if (intakeSessionsEnabled.value === false) {
      lastError.value = "Intake sessions are not available in this environment.";
      return;
    }

    await runTask(isStartingIntakeSession, "intake session start failed", async () => {
      const session = await postJson<IntakeSessionPayload>("/api/intake/sessions", {
        request_text: requestText,
      });
      intakeSession.value = session;
      intakeQuestionAnswers.value = readQuestionAnswers(session);
      intakeOperatorNotes.value = "";
      intakeFinalizeNote.value = "";
      await refreshConsoleState({ status: true, proposals: false });
    });
  }

  async function continueIntakeSession() {
    const session = intakeSession.value;

    if (!session) {
      lastError.value = "Start an intake session before continuing it.";
      return;
    }

    if (intakeSessionsEnabled.value === false) {
      lastError.value = "Intake sessions are not available in this environment.";
      return;
    }

    await runTask(isContinuingIntakeSession, "intake session continue failed", async () => {
      const nextSession = await postJson<IntakeSessionPayload>(
        `/api/intake/sessions/${session.session.id}/continue`,
        {
          expected_session_revision: session.session_revision,
          operator_notes: intakeOperatorNotes.value,
          question_answers: intakeQuestionAnswers.value,
        },
      );
      intakeSession.value = nextSession;
      intakeQuestionAnswers.value = readQuestionAnswers(nextSession);
      intakeOperatorNotes.value = "";
      await refreshConsoleState({ status: true, proposals: false });
    });
  }

  async function finalizeIntakeSession() {
    const session = intakeSession.value;

    if (!session) {
      lastError.value = "Start an intake session before finalising it.";
      return;
    }

    if (intakeSessionsEnabled.value === false) {
      lastError.value = "Intake sessions are not available in this environment.";
      return;
    }

    await runTask(isFinalizingIntakeSession, "intake session finalization failed", async () => {
      const nextSession = await postJson<IntakeSessionPayload>(
        `/api/intake/sessions/${session.session.id}/finalize`,
        {
          expected_session_revision: session.session_revision,
          finalize_note: intakeFinalizeNote.value,
        },
      );
      intakeSession.value = nextSession;
      intakeQuestionAnswers.value = readQuestionAnswers(nextSession);
      intakeFinalizeNote.value = "";
      await refreshConsoleState({ status: true, proposals: false });
    });
  }

  async function abandonIntakeSession() {
    const session = intakeSession.value;

    if (!session) {
      lastError.value = "Start an intake session before abandoning it.";
      return;
    }

    if (intakeSessionsEnabled.value === false) {
      lastError.value = "Intake sessions are not available in this environment.";
      return;
    }

    await runTask(isAbandoningIntakeSession, "intake session abandonment failed", async () => {
      const nextSession = await postJson<IntakeSessionPayload>(
        `/api/intake/sessions/${session.session.id}/abandon`,
        {
          expected_session_revision: session.session_revision,
        },
      );
      intakeSession.value = nextSession;
      intakeQuestionAnswers.value = readQuestionAnswers(nextSession);
      await refreshConsoleState({ status: true, proposals: false });
    });
  }

  async function generateReviewProposalSetForSelectedTranche() {
    const trancheId = requireSelectedTranche(
      "Select a tranche before generating review follow-up proposals.",
    );

    if (trancheId) {
      await generateReviewProposalSetForTranche(trancheId);
    }
  }

  async function generateReviewProposalSetForTranche(trancheId: string) {
    await runTask(isGeneratingProposal, "review proposal generation failed", async () => {
      selectedProposalSet.value = await postJson<ProposalSetPayload>(
        `/api/proposals/review/${trancheId}`,
        {},
      );
      selectedProposalSetId.value = selectedProposalSet.value.id;
      selectedTrancheId.value = trancheId;
      await refreshConsoleState({ status: true, proposals: true });
    });
  }

  async function mutateProposal(
    proposalId: string,
    action: "approve" | "reject",
  ) {
    activeProposalMutationId.value = proposalId;
    lastError.value = "";

    try {
      await postJson<ProposalMutationPayload>(`/api/proposals/${proposalId}/${action}`, {});

      await refreshConsoleState({ status: true, proposals: true });
    } catch (error) {
      setTaskError(error, `proposal ${action} failed`);
    } finally {
      activeProposalMutationId.value = "";
    }
  }

  function setIntakeQuestionAnswer(questionId: string, answer: string) {
    intakeQuestionAnswers.value = {
      ...intakeQuestionAnswers.value,
      [questionId]: answer,
    };
  }

  function setIntakeQuestionAnswerFromEvent(questionId: string, event: Event) {
    const target = event.target;

    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    setIntakeQuestionAnswer(questionId, target.value);
  }

  function requireSelectedTranche(message: string): string | null {
    if (!selectedTrancheId.value) {
      lastError.value = message;
      return null;
    }

    return selectedTrancheId.value;
  }

  function ensureSelectedTranche() {
    if (!status.value?.project.active_project) {
      selectedTrancheId.value = "";
      return;
    }

    const firstTranche = status.value?.validation.tranches[0]?.frontmatter?.id;

    if (!selectedTrancheId.value && typeof firstTranche === "string") {
      selectedTrancheId.value = firstTranche;
    }
  }

  function readQuestionAnswers(session: IntakeSessionPayload | null): Record<string, string> {
    if (!session) {
      return {};
    }

    return Object.fromEntries(
      session.questions.map((question) => [question.id, question.answer_text ?? ""]),
    );
  }

  function setTaskError(error: unknown, fallbackMessage: string) {
    if (error instanceof ApiError) {
      lastErrorCode.value = error.errorCode ?? "";
      lastErrorRetryable.value = error.retryable;
      lastError.value = readApiErrorMessage(error, fallbackMessage);

      return;
    }

    lastErrorCode.value = "";
    lastErrorRetryable.value = false;
    lastError.value = error instanceof Error ? error.message : fallbackMessage;
  }

  async function refreshWorkspace(options: { clearError?: boolean } = {}) {
    await loadStatus(options);

    if (status.value?.project.active_project) {
      await loadProposalQueue({ clearError: false });
      await loadActiveIntakeSession({ clearError: false });
    }
  }

  async function openKnownProject(path: string) {
    existingProjectPath.value = path;
    await openManagedProject();
  }

  async function refreshConsoleState(input: { status?: boolean; proposals?: boolean }) {
    await Promise.all([
      input.status ? loadStatus({ clearError: false }) : Promise.resolve(),
      input.proposals ? loadProposalQueue({ clearError: false }) : Promise.resolve(),
    ]);
  }

  async function refreshAfterProjectSwitch() {
    resetProjectScopedState();
    await refreshWorkspace({ clearError: false });
  }

  async function runTask(
    flag: Ref<boolean>,
    fallbackMessage: string,
    task: () => Promise<void>,
  ) {
    flag.value = true;
    lastError.value = "";
    lastErrorCode.value = "";
    lastErrorRetryable.value = false;

    try {
      await task();
    } catch (error) {
      setTaskError(error, fallbackMessage);
    } finally {
      flag.value = false;
    }
  }

  function resetProjectScopedState() {
    proposalSets.value = [];
    selectedProposalSetId.value = "";
    selectedProposalSet.value = null;
    selectedTrancheId.value = "";
    generatedPackage.value = null;
    generatedPackageSet.value = null;
    generatedReview.value = null;
    resetIntakeState();
  }

  function resetIntakeState() {
    intakeSession.value = null;
    intakeQuestionAnswers.value = {};
    intakeOperatorNotes.value = "";
    intakeFinalizeNote.value = "";
  }

  const trancheOptions = computed(() =>
    (status.value?.validation.tranches ?? []).map((record) => {
      const id = record.frontmatter?.id;
      const title = record.frontmatter?.title;

      return {
        label:
          typeof id === "string" && typeof title === "string"
            ? `${id}: ${title}`
            : record.path,
        value: typeof id === "string" ? id : record.path,
      };
    }),
  );

  const intakeSessionsEnabled = computed(
    () => status.value?.feature_flags.intake_sessions_v1 !== false,
  );
  const activeIntakeSession = computed(() => intakeSession.value?.session ?? null);
  const currentIntakeBrief = computed(() => intakeSession.value?.current_brief ?? null);
  const currentIntakeBriefEntries = computed(() => intakeSession.value?.current_brief_entries ?? []);
  const currentIntakeQuestions = computed(() => intakeSession.value?.questions ?? []);
  const currentIntakeQuestionLineage = computed(
    () => intakeSession.value?.question_lineage_summary ?? [],
  );
  const canContinueIntakeSession = computed(
    () => Boolean(intakeSession.value) && !isContinuingIntakeSession.value,
  );
  const canFinalizeIntakeSession = computed(
    () => Boolean(intakeSession.value) && !isFinalizingIntakeSession.value,
  );
  const canAbandonIntakeSession = computed(
    () => Boolean(intakeSession.value) && !isAbandoningIntakeSession.value,
  );
  const canStartIntakeSession = computed(
    () =>
      !intakeSession.value &&
      !isStartingIntakeSession.value &&
      intakeSessionsEnabled.value &&
      Boolean(intakeRequest.value.trim()),
  );

  const activeProject = computed(() => status.value?.project.active_project ?? null);
  const knownProjects = computed(() => status.value?.project.known_projects ?? []);
  const validationIssueCount = computed(() => status.value?.errors.length ?? 0);
  const openQuestionCount = computed(
    () => status.value?.validation.openQuestions.length ?? 0,
  );

  const repositoryDetails = computed(() => {
    const repositoryState = status.value?.repository_state;

    if (!repositoryState) {
      return {
        available: false,
        branch: null,
        head: null,
        shortHead: null,
        dirtyFileCount: 0,
        isDirty: false,
      };
    }

    return {
      available: repositoryState.available,
      branch: repositoryState.branch,
      head: repositoryState.head,
      shortHead:
        typeof repositoryState.head === "string" ? repositoryState.head.slice(0, 8) : null,
      dirtyFileCount: repositoryState.dirty_paths.length,
      isDirty: repositoryState.is_dirty,
    };
  });

  const repositoryRecordCounts = computed(() => ({
    tranches: status.value?.validation.tranches.length ?? 0,
    decisions: status.value?.validation.decisions.length ?? 0,
    reviews: status.value?.validation.reviews.length ?? 0,
    glossaryTerms: status.value?.validation.glossaryTerms.length ?? 0,
    planPackages: status.value?.validation.planPackages.length ?? 0,
    executionPackages: status.value?.validation.executionPackages.length ?? 0,
  }));

  const llmUsageSummary = computed(() => ({
    total_tokens: status.value?.llm_usage.total_tokens ?? 0,
    openai_tokens: status.value?.llm_usage.openai_tokens ?? 0,
    codex_tokens: status.value?.llm_usage.codex_tokens ?? 0,
  }));

  const reviewPackageRegenerationIds = computed(() => {
    const review = generatedReview.value;

    if (!review) {
      return [];
    }

    const requiresRefresh = review.record.drift_signals.some((signal) =>
      reviewPackageRefreshSignals.has(signal),
    );

    return requiresRefresh ? review.record.related_packages : [];
  });

  const canGenerateReviewFollowUp = computed(
    () => generatedReview.value?.record.status === "attention_required",
  );

  const hasActiveProject = computed(() => Boolean(status.value?.project.active_project));
  const lastErrorGuidance = computed(() => {
    if (!lastError.value) {
      return "";
    }

    if (lastErrorCode.value.startsWith("intake_session_")) {
      return "Reload the intake session and try again.";
    }

    if (lastErrorCode.value === "active_intake_session_exists") {
      return "Open the active intake session instead of starting a new one.";
    }

    if (lastErrorCode.value.startsWith("analysis_")) {
      return "Use the existing proposal workflow or refresh the intake session.";
    }

    if (lastErrorRetryable.value) {
      return "You can retry this action.";
    }

    return "";
  });

  return {
    status,
    proposalSets,
    selectedProposalSetId,
    selectedProposalSet,
    isLoading,
    isLoadingProposals,
    isGeneratingPackage,
    isRefreshingPackageSet,
    isGeneratingReview,
    isGeneratingProposal,
    isLoadingIntakeSession,
    isStartingIntakeSession,
    isContinuingIntakeSession,
    isFinalizingIntakeSession,
    isAbandoningIntakeSession,
    activeProposalMutationId,
    packageType,
    selectedTrancheId,
    generatedPackage,
    generatedPackageSet,
    generatedReview,
    newProjectName,
    newProjectPath,
    existingProjectPath,
    intakeRequest,
    intakeOperatorNotes,
    intakeFinalizeNote,
    intakeSession,
    intakeQuestionAnswers,
    intakeSessionsEnabled,
    activeIntakeSession,
    currentIntakeBrief,
    currentIntakeBriefEntries,
    currentIntakeQuestions,
    currentIntakeQuestionLineage,
    canStartIntakeSession,
    canContinueIntakeSession,
    canFinalizeIntakeSession,
    canAbandonIntakeSession,
    lastError,
    lastErrorCode,
    lastErrorGuidance,
    lastErrorRetryable,
    isCreatingProject,
    isOpeningProject,
    isSelectingProjectPath,
    trancheOptions,
    reviewPackageRegenerationIds,
    canGenerateReviewFollowUp,
    hasActiveProject,
    activeProject,
    knownProjects,
    validationIssueCount,
    openQuestionCount,
    repositoryDetails,
    repositoryRecordCounts,
    llmUsageSummary,
    refreshWorkspace,
    loadStatus,
    loadProposalQueue,
    loadProposalSet,
    loadActiveIntakeSession,
    createManagedProject,
    openManagedProject,
    openKnownProject,
    selectProjectDirectory,
    generateSelectedPackage,
    generatePackageFor,
    refreshSelectedPackageSet,
    regeneratePackageFromReview,
    generateReviewCheckpoint,
    startIntakeSession,
    continueIntakeSession,
    finalizeIntakeSession,
    abandonIntakeSession,
    generateReviewProposalSetForSelectedTranche,
    generateReviewProposalSetForTranche,
    mutateProposal,
    setIntakeQuestionAnswer,
    setIntakeQuestionAnswerFromEvent,
  };
});

function readApiErrorMessage(error: ApiError, fallbackMessage: string): string {
  return error.message || fallbackMessage;
}
