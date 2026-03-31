<script setup lang="ts">
import { computed } from "vue";

import Button from "primevue/button";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

const project = computed(() => store.activeProject);
const repository = computed(() => store.repositoryDetails);

const summaryItems = computed(() => [
  {
    label: "Project path",
    value: project.value?.path ?? "No project path available",
    wide: true,
  },
  {
    label: "Git repository",
    value: project.value?.is_git_repository ? "Yes" : "No",
  },
  {
    label: "Branch",
    value: repository.value.available ? repository.value.branch ?? "Detached" : "Unavailable",
  },
  {
    label: "Head",
    value: repository.value.available ? repository.value.shortHead ?? "Unknown" : "Unavailable",
  },
  {
    label: "Dirty files",
    value: String(repository.value.dirtyFileCount),
  },
  {
    label: "Validation issues",
    value: String(store.validationIssueCount),
  },
  {
    label: "Open questions",
    value: String(store.openQuestionCount),
  },
]);

function scrollToProjectAccess() {
  document.getElementById("workspace-project-access")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
</script>

<template>
  <section class="panel workspace-panel workspace-panel--primary">
    <div class="workspace-section__heading">
      <div>
        <p class="section-kicker">Active project</p>
        <h3>{{ project?.name }}</h3>
        <p>Inspect current repository truth, refresh state, or switch to another managed project.</p>
      </div>

      <div class="panel-actions">
        <Button
          label="Switch project"
          icon="pi pi-arrow-right-arrow-left"
          severity="secondary"
          @click="scrollToProjectAccess"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          :loading="store.isLoading"
          @click="() => store.loadStatus()"
        />
      </div>
    </div>

    <dl class="workspace-summary-grid">
      <div
        v-for="item in summaryItems"
        :key="item.label"
        class="workspace-summary-grid__item"
        :class="{ 'workspace-summary-grid__item--wide': item.wide }"
      >
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </div>
    </dl>
  </section>
</template>
