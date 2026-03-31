<script setup lang="ts">
import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="panel workspace-panel">
    <div class="workspace-section__heading">
      <div>
        <p class="section-kicker">Repository detail</p>
        <h3>Current follow-up items</h3>
        <p>Only the details behind the global status bar appear here.</p>
      </div>
    </div>

    <div class="workspace-detail-grid">
      <div v-if="store.validationIssueCount > 0" class="workspace-detail-block">
        <h4>Validation issues ({{ store.validationIssueCount }})</h4>
        <ul class="bullet-list">
          <li v-for="error in store.status?.errors ?? []" :key="error">{{ error }}</li>
        </ul>
      </div>

      <div v-if="store.openQuestionCount > 0" class="workspace-detail-block">
        <h4>Open questions ({{ store.openQuestionCount }})</h4>
        <ul class="bullet-list">
          <li v-for="question in store.status?.validation.openQuestions ?? []" :key="question">
            {{ question }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
