import { computed, ref, watch, type Ref } from "vue";
import { defineStore } from "pinia";
import {
  ApiError,
  type CreateProjectPayload,
  type DirectorySelectionPayload,
  getJson,
  type OpenProjectPayload,
  postJson,
  type IntakeAnalysis,
  type PackagePayload,
  type PackageSetPayload,
  type ProposalMutationPayload,
  type ProposalSetPayload,
  type ProposalSetSummary,
  type ReviewPayload,
  type StatusPayload,
} from "../api/console";

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
  const isAnalyzingIntake = ref(false);
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
  const intakeAnalysis = ref<IntakeAnalysis | null>(null);
  const intakeAnswers = ref<Record<string, string>>({});
  const intakeAnalysisStale = ref(false);
  const lastAnalyzedRequest = ref("");
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

  async function analyzeIntakeRequest() {
    if (!intakeRequest.value.trim()) {
      lastError.value = "Enter a request before running intake analysis.";
      return;
    }

    await runTask(isAnalyzingIntake, "intake analysis failed", async () => {
      const priorAnswers = { ...intakeAnswers.value };
      const analysis = await postJson<IntakeAnalysis>("/api/intake/analyze", {
        request: intakeRequest.value.trim(),
      });
      intakeAnalysis.value = analysis;
      intakeAnalysisStale.value = false;
      lastAnalyzedRequest.value = normalizeIntakeRequest(intakeRequest.value);
      intakeAnswers.value = Object.fromEntries(
        analysis.material_questions.map((question) => [
          question.id,
          priorAnswers[question.id] ?? "",
        ]),
      );
    });
  }

  async function generateIntakeProposalSetFromAnalysis() {
    if (!intakeRequest.value.trim()) {
      lastError.value = "Enter a request before generating proposals.";
      return;
    }

    if (!intakeAnalysis.value) {
      lastError.value = "Run intake analysis before generating proposals.";
      return;
    }

    if (intakeAnalysisStale.value) {
      lastError.value = "Re-run intake analysis before generating proposals.";
      return;
    }

    await runTask(isGeneratingProposal, "proposal generation failed", async () => {
      selectedProposalSet.value = await postJson<ProposalSetPayload>("/api/proposals/intake", {
        request: intakeRequest.value,
        answers: intakeAnswers.value,
        analysis: intakeAnalysis.value,
      });
      selectedProposalSetId.value = selectedProposalSet.value.id;
      await refreshConsoleState({ status: true, proposals: true });
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

  function setIntakeAnswer(questionId: string, answer: string) {
    intakeAnswers.value = {
      ...intakeAnswers.value,
      [questionId]: answer,
    };
  }

  function setIntakeAnswerFromEvent(questionId: string, event: Event) {
    const target = event.target;

    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    setIntakeAnswer(questionId, target.value);
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

  function setTaskError(error: unknown, fallbackMessage: string) {
    if (error instanceof ApiError) {
      lastErrorCode.value = error.errorCode ?? "";
      lastErrorRetryable.value = error.retryable;
      lastError.value = readApiErrorMessage(error, fallbackMessage);

      if (error.errorCode?.startsWith("analysis_")) {
        intakeAnalysisStale.value = true;
      }

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
    intakeAnalysis.value = null;
    intakeAnswers.value = {};
    intakeAnalysisStale.value = false;
    lastAnalyzedRequest.value = "";
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

  const blockingQuestions = computed(() =>
    intakeAnalysis.value?.material_questions.filter((question) => question.blocking) ?? [],
  );

  const hasUnansweredBlockingQuestions = computed(() =>
    blockingQuestions.value.some((question) => !intakeAnswers.value[question.id]?.trim()),
  );
  const canGenerateIntakeProposalSet = computed(
    () =>
      Boolean(intakeAnalysis.value) &&
      !intakeAnalysisStale.value &&
      !hasUnansweredBlockingQuestions.value &&
      !isGeneratingProposal.value,
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

  watch(intakeRequest, (nextValue) => {
    if (!intakeAnalysis.value) {
      return;
    }

    intakeAnalysisStale.value =
      normalizeIntakeRequest(nextValue) !== lastAnalyzedRequest.value;
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
    isAnalyzingIntake,
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
    intakeAnalysis,
    intakeAnswers,
    intakeAnalysisStale,
    lastError,
    lastErrorCode,
    lastErrorRetryable,
    isCreatingProject,
    isOpeningProject,
    isSelectingProjectPath,
    trancheOptions,
    blockingQuestions,
    hasUnansweredBlockingQuestions,
    canGenerateIntakeProposalSet,
    reviewPackageRegenerationIds,
    canGenerateReviewFollowUp,
    hasActiveProject,
    activeProject,
    knownProjects,
    validationIssueCount,
    openQuestionCount,
    repositoryDetails,
    repositoryRecordCounts,
    refreshWorkspace,
    loadStatus,
    loadProposalQueue,
    loadProposalSet,
    createManagedProject,
    openManagedProject,
    openKnownProject,
    selectProjectDirectory,
    generateSelectedPackage,
    generatePackageFor,
    refreshSelectedPackageSet,
    regeneratePackageFromReview,
    generateReviewCheckpoint,
    analyzeIntakeRequest,
    generateIntakeProposalSetFromAnalysis,
    generateReviewProposalSetForSelectedTranche,
    generateReviewProposalSetForTranche,
    mutateProposal,
    setIntakeAnswer,
    setIntakeAnswerFromEvent,
  };
});

function normalizeIntakeRequest(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
}

function readApiErrorMessage(error: ApiError, fallbackMessage: string): string {
  if (error.errorCode?.startsWith("analysis_")) {
    return `${error.message} Re-run intake analysis before generating proposals.`;
  }

  if (error.retryable) {
    return `${error.message} You can retry this action.`;
  }

  return error.message || fallbackMessage;
}
