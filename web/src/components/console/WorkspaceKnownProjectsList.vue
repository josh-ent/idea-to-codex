<script setup lang="ts">
import Button from "primevue/button";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

function openProject(path: string) {
  store.existingProjectPath = path;
  void store.openManagedProject();
}
</script>

<template>
  <section class="panel workspace-panel">
    <div class="workspace-section__heading">
      <div>
        <p class="section-kicker">Known projects</p>
        <h3>Switch between managed repositories</h3>
        <p>The workspace list is secondary to the active project. Open a different project when needed.</p>
      </div>
    </div>

    <div class="workspace-project-list">
      <article
        v-for="project in store.knownProjects"
        :key="project.path"
        class="workspace-project-row"
      >
        <div class="workspace-project-row__body">
          <div class="workspace-project-row__title">
            <h4>{{ project.name }}</h4>
            <span v-if="project.is_active">Active project</span>
          </div>
          <p>{{ project.path }}</p>
        </div>

        <Button
          :label="store.hasActiveProject ? 'Switch' : 'Open'"
          size="small"
          severity="secondary"
          :disabled="project.is_active"
          :loading="store.isOpeningProject && store.existingProjectPath === project.path"
          @click="openProject(project.path)"
        />
      </article>
    </div>
  </section>
</template>
