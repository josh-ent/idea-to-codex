<script setup lang="ts">
import { nextTick, ref } from "vue";

import WorkspaceAttentionPanel from "./WorkspaceAttentionPanel.vue";
import WorkspaceManageProjectsPanel from "./WorkspaceManageProjectsPanel.vue";
import WorkspaceProjectHeaderCard from "./WorkspaceProjectHeaderCard.vue";
import WorkspaceTruthSummary from "./WorkspaceTruthSummary.vue";

const manageProjectsOpen = ref(false);

async function revealManageProjects() {
  manageProjectsOpen.value = true;
  await nextTick();
  document.getElementById("workspace-manage-projects")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
</script>

<template>
  <section class="workspace-state workspace-state--active">
    <WorkspaceProjectHeaderCard @manage-projects="revealManageProjects" />

    <div class="workspace-state__body">
      <WorkspaceAttentionPanel />
      <WorkspaceTruthSummary />
    </div>

    <WorkspaceManageProjectsPanel v-model:open="manageProjectsOpen" />
  </section>
</template>
