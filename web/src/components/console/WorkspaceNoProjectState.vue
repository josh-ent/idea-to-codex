<script setup lang="ts">
import { computed } from "vue";

import KnownProjectsCompactList from "./KnownProjectsCompactList.vue";
import WorkspaceProjectAccessControls from "./WorkspaceProjectAccessControls.vue";
import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

const showKnownProjects = computed(() => store.knownProjects.length > 0);
</script>

<template>
  <section class="workspace-state workspace-state--setup">
    <section class="panel workspace-empty-state">
      <p class="section-kicker">Workspace</p>
      <h3>No active project selected</h3>
      <p>
        Choose one managed repository to enter the operator workflow. Until then, the workspace
        stays focused on project access rather than repository detail.
      </p>
    </section>

    <section class="panel workspace-section-panel">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Project access</p>
          <h3>Start by creating or opening a project</h3>
          <p>Pick the repository you want to work in before running intake, proposals, packages, or review.</p>
        </div>
      </div>

      <WorkspaceProjectAccessControls />
    </section>

    <section v-if="showKnownProjects" class="panel workspace-section-panel">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Known projects</p>
          <h3>Open a recent managed project</h3>
          <p>Show direct project entry points only when the workspace already knows about them.</p>
        </div>
      </div>

      <KnownProjectsCompactList />
    </section>
  </section>
</template>
