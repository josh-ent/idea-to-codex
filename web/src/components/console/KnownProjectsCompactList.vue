<script setup lang="ts">
import Button from "primevue/button";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

function activateProject(path: string) {
  void store.openKnownProject(path);
}
</script>

<template>
  <ul class="workspace-project-switcher" role="list">
    <li
      v-for="project in store.knownProjects"
      :key="project.path"
      class="workspace-project-switcher__item"
    >
      <div class="workspace-project-switcher__meta">
        <div class="workspace-project-switcher__title">
          <strong>{{ project.name }}</strong>
          <span v-if="project.is_active" class="workspace-project-switcher__badge">Active</span>
        </div>
        <p class="workspace-project-switcher__path">{{ project.path }}</p>
      </div>

      <Button
        :label="project.is_active ? 'Active' : store.hasActiveProject ? 'Switch' : 'Open'"
        size="small"
        severity="secondary"
        :disabled="project.is_active"
        :loading="store.isOpeningProject && store.existingProjectPath === project.path"
        @click="activateProject(project.path)"
      />
    </li>
  </ul>
</template>
