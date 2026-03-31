<script setup lang="ts">
import { computed } from "vue";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

const hasAttention = computed(
  () => store.validationIssueCount > 0 || store.openQuestionCount > 0,
);
</script>

<template>
  <section class="panel workspace-section-panel">
    <div class="section-heading">
      <div>
        <p class="section-kicker">Repository health</p>
        <h3>Current attention</h3>
        <p>Show only the issues that change what the operator should do next.</p>
      </div>
    </div>

    <div v-if="hasAttention" class="workspace-attention-list">
      <section v-if="store.validationIssueCount > 0" class="workspace-attention-group">
        <h4>Validation issues ({{ store.validationIssueCount }})</h4>
        <ul class="bullet-list">
          <li v-for="error in store.status?.errors ?? []" :key="error">{{ error }}</li>
        </ul>
      </section>

      <section v-if="store.openQuestionCount > 0" class="workspace-attention-group">
        <h4>Open questions ({{ store.openQuestionCount }})</h4>
        <ul class="bullet-list">
          <li v-for="question in store.status?.validation.openQuestions ?? []" :key="question">
            {{ question }}
          </li>
        </ul>
      </section>
    </div>

    <p v-else class="workspace-attention-clear">
      No current validation or question backlog is blocking the active repository view.
    </p>
  </section>
</template>
