<script setup lang="ts">
import { computed } from "vue";

import { useConsoleStore } from "../../stores/console";
import WorkspaceActiveProjectCard from "./WorkspaceActiveProjectCard.vue";
import WorkspaceIssuesList from "./WorkspaceIssuesList.vue";
import WorkspaceKnownProjectsList from "./WorkspaceKnownProjectsList.vue";
import WorkspaceProjectAccessPanel from "./WorkspaceProjectAccessPanel.vue";
import WorkspaceRepoSummary from "./WorkspaceRepoSummary.vue";

const store = useConsoleStore();

const showKnownProjects = computed(() => store.knownProjects.length > 1);
const showRepositoryDetail = computed(
  () => store.validationIssueCount > 0 || store.openQuestionCount > 0,
);
</script>

<template>
  <section class="workspace-screen">
    <section v-if="!store.hasActiveProject" class="panel workspace-hero">
      <p class="section-kicker">Workspace</p>
      <h3>No active project</h3>
      <p>
        Choose a managed repository before running intake, proposal, package, or review workflows.
        The console stays thin until a project is active.
      </p>
    </section>

    <WorkspaceActiveProjectCard v-else />

    <div id="workspace-project-access">
      <WorkspaceProjectAccessPanel />
    </div>

    <WorkspaceKnownProjectsList v-if="showKnownProjects" />

    <template v-if="store.hasActiveProject">
      <WorkspaceRepoSummary />
      <WorkspaceIssuesList v-if="showRepositoryDetail" />
    </template>
  </section>
</template>
