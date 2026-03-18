import { computed, ref } from "vue";
import { defineStore } from "pinia";

export interface ValidatedRecord {
  path: string;
  content: string;
  errors: string[];
  frontmatter: Record<string, unknown> | null;
}

export interface TraceLink {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  reason: string;
}

export interface StatusPayload {
  validation: {
    rootFiles: Array<{ path: string; exists: boolean }>;
    directories: Array<{ path: string; exists: boolean }>;
    decisions: ValidatedRecord[];
    tranches: ValidatedRecord[];
    reviews: ValidatedRecord[];
    planPackages: ValidatedRecord[];
    executionPackages: ValidatedRecord[];
    assumptions: Array<{ id: string; text: string }>;
    glossaryTerms: Array<{ term: string; definition: string; notes: string }>;
    openQuestions: string[];
    traceLinks: TraceLink[];
  };
  errors: string[];
}

export interface PackagePayload {
  id: string;
  relativePath: string;
  record: {
    id: string;
    type: "plan" | "execution";
    source_tranche: string;
  };
  path: string;
  content: string;
}

export interface ReviewPayload {
  id: string;
  relativePath: string;
  record: {
    id: string;
    source_tranche: string;
    status: "recorded" | "attention_required";
  };
  path: string;
  content: string;
}

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

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T | { error?: string; errors?: string[] };

  if (!response.ok) {
    if ("error" in payload && typeof payload.error === "string") {
      throw new Error(payload.error);
    }

    if ("errors" in payload && Array.isArray(payload.errors)) {
      throw new Error(payload.errors.join("\n"));
    }

    throw new Error(`request failed with status ${response.status}`);
  }

  return payload as T;
}

export const useConsoleStore = defineStore("console", () => {
  const status = ref<StatusPayload | null>(null);
  const isLoading = ref(false);
  const isGeneratingPackage = ref(false);
  const isGeneratingReview = ref(false);
  const packageType = ref<"plan" | "execution">("plan");
  const selectedTrancheId = ref<string>("");
  const generatedPackage = ref<PackagePayload | null>(null);
  const generatedReview = ref<ReviewPayload | null>(null);
  const intakeRequest = ref("");
  const intakeAnalysis = ref<IntakeAnalysis | null>(null);
  const lastError = ref<string>("");

  async function loadStatus() {
    isLoading.value = true;
    lastError.value = "";

    try {
      const response = await fetch("/api/status");
      const payload = (await response.json()) as StatusPayload;

      if (!response.ok) {
        throw new Error(payload.errors?.join("\n") || "status request failed");
      }

      status.value = payload;

      const firstTranche = payload.validation.tranches[0]?.frontmatter?.id;

      if (!selectedTrancheId.value && typeof firstTranche === "string") {
        selectedTrancheId.value = firstTranche;
      }
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "status request failed";
    } finally {
      isLoading.value = false;
    }
  }

  async function generateSelectedPackage() {
    if (!selectedTrancheId.value) {
      lastError.value = "Select a tranche before generating a package.";
      return;
    }

    isGeneratingPackage.value = true;
    lastError.value = "";

    try {
      generatedPackage.value = await postJson<PackagePayload>(
        `/api/packages/${packageType.value}/${selectedTrancheId.value}`,
        { persist: true },
      );
      await loadStatus();
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "package generation failed";
    } finally {
      isGeneratingPackage.value = false;
    }
  }

  async function generateReviewCheckpoint() {
    if (!selectedTrancheId.value) {
      lastError.value = "Select a tranche before generating a review checkpoint.";
      return;
    }

    isGeneratingReview.value = true;
    lastError.value = "";

    try {
      generatedReview.value = await postJson<ReviewPayload>(
        `/api/reviews/${selectedTrancheId.value}`,
        { persist: true },
      );
      await loadStatus();
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "review generation failed";
    } finally {
      isGeneratingReview.value = false;
    }
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
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "intake analysis failed";
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

  return {
    status,
    isLoading,
    isGeneratingPackage,
    isGeneratingReview,
    packageType,
    selectedTrancheId,
    generatedPackage,
    generatedReview,
    intakeRequest,
    intakeAnalysis,
    lastError,
    trancheOptions,
    loadStatus,
    generateSelectedPackage,
    generateReviewCheckpoint,
    analyzeIntakeRequest,
  };
});
