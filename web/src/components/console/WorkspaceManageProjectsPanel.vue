<script setup lang="ts">
import { computed } from "vue";

import KnownProjectsCompactList from "./KnownProjectsCompactList.vue";
import WorkspaceProjectAccessControls from "./WorkspaceProjectAccessControls.vue";
import { useConsoleStore } from "../../stores/console";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const store = useConsoleStore();

const showKnownProjects = computed(() => store.knownProjects.length > 1);

function handleToggle(event: Event) {
  if (!(event.currentTarget instanceof HTMLDetailsElement)) {
    return;
  }

  emit("update:open", event.currentTarget.open);
}
</script>

<template>
  <details
    id="workspace-manage-projects"
    class="panel workspace-manage-projects"
    :open="props.open"
    @toggle="handleToggle"
  >
    <summary class="workspace-manage-projects__summary">
      <div>
        <p class="section-kicker">Project access</p>
        <h3>Manage projects</h3>
        <p>Switch repositories, open an existing project, or bootstrap a new one without taking over the workspace.</p>
      </div>
      <span class="workspace-manage-projects__hint">
        {{ props.open ? "Hide" : "Show" }}
      </span>
    </summary>

    <div class="workspace-manage-projects__content">
      <WorkspaceProjectAccessControls default-mode="open" open-action-label="Switch project" />

      <section v-if="showKnownProjects" class="workspace-manage-projects__known">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Known projects</p>
            <h3>Switch quickly</h3>
            <p>Only show alternate managed repositories when there is actually a choice.</p>
          </div>
        </div>

        <KnownProjectsCompactList />
      </section>
    </div>
  </details>
</template>
