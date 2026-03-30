import { computed, ref, type Ref } from "vue";
import { defineStore } from "pinia";
import {
  getJson,
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
  const activeProposalMutationId = ref("");
  const packageType = ref<"plan" | "execution">("plan");
  const selectedTrancheId = ref<string>("");
  const generatedPackage = ref<PackagePayload | null>(null);
  const generatedPackageSet = ref<PackageSetPayload | null>(null);
  const generatedReview = ref<ReviewPayload | null>(null);
  const intakeRequest = ref("");
  const intakeAnalysis = ref<IntakeAnalysis | null>(null);
  const intakeAnswers = ref<Record<string, string>>({});
  const lastError = ref<string>("");

  async function loadStatus(options: { clearError?: boolean } = {}) {
    isLoading.value = true;

    if (options.clearError !== false) {
      lastError.value = "";
    }

    try {
      status.value = await getJson<StatusPayload>("/api/status");
      ensureSelectedTranche();
    } catch (error) {
      setTaskError(error, "status request failed");
    } finally {
      isLoading.value = false;
    }
  }

  async function loadProposalQueue(options: { clearError?: boolean } = {}) {
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

    lastError.value = "";

    try {
      intakeAnalysis.value = await postJson<IntakeAnalysis>("/api/intake/analyze", {
        request: intakeRequest.value,
      });
      intakeAnswers.value = Object.fromEntries(
        intakeAnalysis.value.material_questions.map((question) => [
          question.id,
          intakeAnswers.value[question.id] ?? "",
        ]),
      );
    } catch (error) {
      setTaskError(error, "intake analysis failed");
    }
  }

  async function generateIntakeProposalSetFromAnalysis() {
    if (!intakeRequest.value.trim()) {
      lastError.value = "Enter a request before generating proposals.";
      return;
    }

    await runTask(isGeneratingProposal, "proposal generation failed", async () => {
      selectedProposalSet.value = await postJson<ProposalSetPayload>("/api/proposals/intake", {
        request: intakeRequest.value,
        answers: intakeAnswers.value,
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
    const firstTranche = status.value?.validation.tranches[0]?.frontmatter?.id;

    if (!selectedTrancheId.value && typeof firstTranche === "string") {
      selectedTrancheId.value = firstTranche;
    }
  }

  function setTaskError(error: unknown, fallbackMessage: string) {
    lastError.value = error instanceof Error ? error.message : fallbackMessage;
  }

  async function refreshConsoleState(input: { status?: boolean; proposals?: boolean }) {
    await Promise.all([
      input.status ? loadStatus({ clearError: false }) : Promise.resolve(),
      input.proposals ? loadProposalQueue({ clearError: false }) : Promise.resolve(),
    ]);
  }

  async function runTask(
    flag: Ref<boolean>,
    fallbackMessage: string,
    task: () => Promise<void>,
  ) {
    flag.value = true;
    lastError.value = "";

    try {
      await task();
    } catch (error) {
      setTaskError(error, fallbackMessage);
    } finally {
      flag.value = false;
    }
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
    activeProposalMutationId,
    packageType,
    selectedTrancheId,
    generatedPackage,
    generatedPackageSet,
    generatedReview,
    intakeRequest,
    intakeAnalysis,
    intakeAnswers,
    lastError,
    trancheOptions,
    blockingQuestions,
    hasUnansweredBlockingQuestions,
    reviewPackageRegenerationIds,
    canGenerateReviewFollowUp,
    loadStatus,
    loadProposalQueue,
    loadProposalSet,
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
