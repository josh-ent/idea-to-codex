<script setup lang="ts">
import { ref } from "vue";

import Button from "primevue/button";

import { useConsoleStore } from "../../stores/console";

const props = withDefaults(
  defineProps<{
    defaultMode?: "create" | "open";
    openActionLabel?: string;
  }>(),
  {
    defaultMode: "create",
    openActionLabel: "Open project",
  },
);

const store = useConsoleStore();
const mode = ref<"create" | "open">(props.defaultMode);
</script>

<template>
  <div class="workspace-access-grid">
    <div class="workspace-segmented-control" role="tablist" aria-label="Project access mode">
      <button
        type="button"
        class="workspace-segmented-control__button"
        :class="{ 'workspace-segmented-control__button--active': mode === 'create' }"
        :aria-pressed="mode === 'create'"
        @click="mode = 'create'"
      >
        Create new project
      </button>
      <button
        type="button"
        class="workspace-segmented-control__button"
        :class="{ 'workspace-segmented-control__button--active': mode === 'open' }"
        :aria-pressed="mode === 'open'"
        @click="mode = 'open'"
      >
        Open existing project
      </button>
    </div>

    <div v-if="mode === 'create'" class="record-list">
      <label class="control control--wide">
        <span>Project name</span>
        <input
          v-model="store.newProjectName"
          class="control__input"
          placeholder="Example: Billing Console"
        />
      </label>

      <label class="control control--wide">
        <span>Project path</span>
        <div class="control-row">
          <input
            v-model="store.newProjectPath"
            class="control__input"
            placeholder="../projects/billing-console"
          />
          <Button
            label="Browse"
            icon="pi pi-folder-open"
            severity="secondary"
            :loading="store.isSelectingProjectPath"
            @click="
              store.selectProjectDirectory(
                'new',
                'Select the folder to use as the new project path',
              )
            "
          />
        </div>
      </label>

      <div class="panel-actions">
        <Button
          label="Create project"
          icon="pi pi-plus"
          :loading="store.isCreatingProject"
          @click="store.createManagedProject"
        />
      </div>
    </div>

    <div v-else class="record-list">
      <label class="control control--wide">
        <span>Existing project path</span>
        <div class="control-row">
          <input
            v-model="store.existingProjectPath"
            class="control__input"
            placeholder="../projects/existing-project"
          />
          <Button
            label="Browse"
            icon="pi pi-folder-open"
            severity="secondary"
            :loading="store.isSelectingProjectPath"
            @click="
              store.selectProjectDirectory(
                'existing',
                'Select an existing managed project folder',
              )
            "
          />
        </div>
      </label>

      <div class="panel-actions">
        <Button
          :label="openActionLabel"
          icon="pi pi-folder-open"
          severity="secondary"
          :loading="store.isOpeningProject"
          @click="store.openManagedProject"
        />
      </div>
    </div>
  </div>
</template>
