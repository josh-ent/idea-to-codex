<script setup lang="ts">
import { computed } from "vue";

import { useConsoleStore } from "../../stores/console";
import WorkspaceActiveProjectState from "./WorkspaceActiveProjectState.vue";
import WorkspaceNoProjectState from "./WorkspaceNoProjectState.vue";

const store = useConsoleStore();

const workspaceState = computed(() =>
  store.hasActiveProject ? "active-project" : "no-active-project",
);
</script>

<template>
  <section class="workspace-screen">
    <WorkspaceActiveProjectState v-if="workspaceState === 'active-project'" />
    <WorkspaceNoProjectState v-else />
  </section>
</template>
