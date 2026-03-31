<script setup lang="ts">
import { computed } from "vue";

import Button from "primevue/button";

import { useConsoleStore } from "../../stores/console";

const emit = defineEmits<{
  manageProjects: [];
}>();

const store = useConsoleStore();

const project = computed(() => store.activeProject);
const repository = computed(() => store.repositoryDetails);

const facts = computed(() => [
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
</script>

<template>
  <section class="panel workspace-project-card">
    <div class="workspace-project-card__header">
      <div class="workspace-project-card__title">
        <p class="section-kicker">Active project</p>
        <h3>{{ project?.name }}</h3>
        <p class="workspace-project-card__path">{{ project?.path }}</p>
      </div>

      <div class="panel-actions">
        <Button
          label="Manage projects"
          icon="pi pi-arrow-right-arrow-left"
          severity="secondary"
          @click="emit('manageProjects')"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          :loading="store.isLoading || store.isLoadingProposals"
          @click="() => store.refreshWorkspace()"
        />
      </div>
    </div>

    <dl class="workspace-fact-grid">
      <div v-for="fact in facts" :key="fact.label" class="workspace-fact">
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value }}</dd>
      </div>
    </dl>
  </section>
</template>
