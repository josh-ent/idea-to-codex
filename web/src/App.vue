<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import Message from "primevue/message";

import IntakeSection from "./components/console/IntakeSection.vue";
import OverviewSection from "./components/console/OverviewSection.vue";
import PackageSection from "./components/console/PackageSection.vue";
import ProposalSection from "./components/console/ProposalSection.vue";
import ReviewSection from "./components/console/ReviewSection.vue";
import { useConsoleStore } from "./stores/console";

const store = useConsoleStore();

type ScreenId = "overview" | "intake" | "proposals" | "packages" | "review";

const activeScreen = ref<ScreenId>("overview");

const screens: Array<{
  id: ScreenId;
  label: string;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: "overview",
    label: "Workspace",
    title: "Workspace",
    description:
      "Stay oriented in the active project and reach project access only when you need to switch or create one.",
    icon: "pi pi-home",
  },
  {
    id: "intake",
    label: "Intake",
    title: "Intake",
    description: "Turn a vague request into a bounded change and surface the material questions.",
    icon: "pi pi-search",
  },
  {
    id: "proposals",
    label: "Proposals",
    title: "Proposals",
    description: "Review durable proposal drafts and approve or reject truth changes.",
    icon: "pi pi-pencil",
  },
  {
    id: "packages",
    label: "Packages",
    title: "Packages",
    description: "Generate or refresh plan and execution handoffs from repository truth.",
    icon: "pi pi-box",
  },
  {
    id: "review",
    label: "Review",
    title: "Review",
    description: "Inspect drift, package coverage, and corrective actions for the active tranche.",
    icon: "pi pi-check-square",
  },
];

const activeScreenMeta = computed(
  () => screens.find((screen) => screen.id === activeScreen.value) ?? screens[0],
);

const activeProjectName = computed(
  () => store.activeProject?.name ?? "No active project",
);
const llmUsageSummary = computed(() => store.llmUsageSummary);

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

onMounted(() => {
  void store.refreshWorkspace();
});
</script>

<template>
  <main class="app-shell">
    <section class="app-layout">
      <aside class="app-rail">
        <div class="app-rail__brand">
          <p class="app-rail__eyebrow">Operator Console</p>
          <h1>Specification Engine</h1>
        </div>

        <nav class="app-nav" aria-label="Console navigation">
          <button
            v-for="screen in screens"
            :key="screen.id"
            type="button"
            class="app-nav__item"
            :class="{ 'app-nav__item--active': screen.id === activeScreen }"
            @click="activeScreen = screen.id"
          >
            <span :class="[screen.icon, 'app-nav__icon']" aria-hidden="true" />
            <span>{{ screen.label }}</span>
          </button>
        </nav>

        <div class="app-rail__project">
          <span>Active project</span>
          <strong>{{ activeProjectName }}</strong>
          <div class="app-rail__metrics" aria-label="LLM token usage metrics">
            <div class="app-rail__metrics-total">
              <span>Total tokens</span>
              <strong>{{ formatTokenCount(llmUsageSummary.total_tokens) }}</strong>
            </div>

            <dl class="app-rail__metrics-grid">
              <div>
                <dt>OpenAI</dt>
                <dd>{{ formatTokenCount(llmUsageSummary.openai_tokens) }}</dd>
              </div>
              <div>
                <dt>Codex</dt>
                <dd>{{ formatTokenCount(llmUsageSummary.codex_tokens) }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>

      <section class="app-stage">
        <header class="app-header">
          <div class="app-header__context">
            <p class="app-header__eyebrow">{{ activeScreenMeta.label }}</p>
            <h2>{{ activeScreenMeta.title }}</h2>
            <p>{{ activeScreenMeta.description }}</p>
          </div>

          <div class="app-header__project">
            <span>Current project</span>
            <strong>{{ activeProjectName }}</strong>
          </div>
        </header>

        <Message
          v-if="store.lastError"
          severity="error"
          :closable="false"
          class="app-message"
        >
          <p>{{ store.lastError }}</p>
          <small v-if="store.lastErrorGuidance">
            {{ store.lastErrorGuidance }}
          </small>
        </Message>

        <section class="app-content">
          <OverviewSection v-if="activeScreen === 'overview'" />
          <IntakeSection v-else-if="activeScreen === 'intake'" />
          <ProposalSection v-else-if="activeScreen === 'proposals'" />
          <PackageSection v-else-if="activeScreen === 'packages'" />
          <ReviewSection v-else />
        </section>
      </section>
    </section>
  </main>
</template>
