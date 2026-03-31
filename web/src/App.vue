<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import Button from "primevue/button";
import Menu from "primevue/menu";
import Message from "primevue/message";
import Tag from "primevue/tag";
import Toolbar from "primevue/toolbar";

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
    title: "Project workspace",
    description: "Project selection, repository status, and current durable records.",
    icon: "pi pi-home",
  },
  {
    id: "intake",
    label: "Intake",
    title: "Request intake",
    description: "Bound a request, answer blocking questions, and move into proposals.",
    icon: "pi pi-search",
  },
  {
    id: "proposals",
    label: "Proposals",
    title: "Proposal queue",
    description: "Inspect generated truth mutations and approve or reject the draft set.",
    icon: "pi pi-pencil",
  },
  {
    id: "packages",
    label: "Packages",
    title: "Package generation",
    description: "Generate or refresh plan and execution handoffs for the active tranche.",
    icon: "pi pi-box",
  },
  {
    id: "review",
    label: "Review",
    title: "Review checkpoints",
    description: "Persist review output, inspect drift, and trigger the next corrective action.",
    icon: "pi pi-check-square",
  },
];

const activeScreenMeta = computed(
  () => screens.find((screen) => screen.id === activeScreen.value) ?? screens[0],
);

const navigationItems = computed(() =>
  screens.map((screen) => ({
    ...screen,
    command: () => {
      activeScreen.value = screen.id;
    },
  })),
);

const activeProjectName = computed(
  () => store.status?.project.active_project?.name ?? "No active project",
);

const issueCount = computed(() => store.status?.errors.length ?? 0);
const openQuestionCount = computed(
  () => store.status?.validation.openQuestions.length ?? 0,
);

const repositoryState = computed(() => {
  if (!store.hasActiveProject) {
    return { label: "Project required", severity: "warn" as const };
  }

  if (!store.status?.repository_state.available) {
    return { label: "Repository unavailable", severity: "danger" as const };
  }

  if (store.status.repository_state.is_dirty) {
    return { label: "Repository dirty", severity: "warn" as const };
  }

  return { label: "Repository clean", severity: "success" as const };
});

onMounted(() => {
  void (async () => {
    await store.loadStatus();

    if (store.hasActiveProject) {
      await store.loadProposalQueue();
    }
  })();
});
</script>

<template>
  <main class="app-shell">
    <section class="app-layout">
      <aside class="app-sidebar">
        <Menu :model="navigationItems" class="app-menu">
          <template #start>
            <div class="app-sidebar__brand">
              <p class="app-sidebar__eyebrow">Operator Console</p>
              <h1>Specification Engine</h1>
              <p class="app-sidebar__copy">
                Repository truth, proposal review, package generation, and review workflow.
              </p>
            </div>
          </template>

          <template #item="{ item, props }">
            <a
              v-bind="props.action"
              class="app-menu__link"
              :class="{ 'app-menu__link--active': item.id === activeScreen }"
            >
              <span :class="[item.icon, 'app-menu__icon']" aria-hidden="true" />
              <span class="app-menu__label">{{ item.label }}</span>
            </a>
          </template>

          <template #end>
            <div class="app-sidebar__meta">
              <div class="app-sidebar__meta-block">
                <span>Active project</span>
                <strong>{{ activeProjectName }}</strong>
              </div>
              <div class="app-sidebar__meta-block">
                <span>Branch</span>
                <strong>{{ store.status?.repository_state.branch ?? "n/a" }}</strong>
              </div>
            </div>
          </template>
        </Menu>
      </aside>

      <section class="app-stage">
        <Toolbar class="app-toolbar">
          <template #start>
            <div class="app-toolbar__context">
              <p class="app-toolbar__eyebrow">{{ activeScreenMeta.label }}</p>
              <h2>{{ activeScreenMeta.title }}</h2>
              <p>{{ activeScreenMeta.description }}</p>
            </div>
          </template>

          <template #end>
            <div class="app-toolbar__actions">
              <Tag :value="repositoryState.label" :severity="repositoryState.severity" />
              <Tag :value="`${issueCount} issue(s)`" :severity="issueCount ? 'danger' : 'success'" />
              <Tag
                :value="`${openQuestionCount} open question(s)`"
                :severity="openQuestionCount ? 'warn' : 'success'"
              />
              <Button
                label="Refresh"
                icon="pi pi-refresh"
                severity="secondary"
                :loading="store.isLoading"
                @click="() => store.loadStatus()"
              />
            </div>
          </template>
        </Toolbar>

        <Message
          v-if="store.lastError"
          severity="error"
          :closable="false"
          class="app-message"
        >
          {{ store.lastError }}
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
