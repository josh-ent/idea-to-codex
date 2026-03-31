<script setup lang="ts">
import { computed } from "vue";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

const summaryItems = computed(() => [
  { label: "Tranches", value: store.repositoryRecordCounts.tranches },
  { label: "Decision records", value: store.repositoryRecordCounts.decisions },
  { label: "Review checkpoints", value: store.repositoryRecordCounts.reviews },
  { label: "Glossary terms", value: store.repositoryRecordCounts.glossaryTerms },
  {
    label: "Handoff packages",
    value:
      store.repositoryRecordCounts.planPackages + store.repositoryRecordCounts.executionPackages,
  },
]);
</script>

<template>
  <section class="panel workspace-section-panel">
    <div class="section-heading">
      <div>
        <p class="section-kicker">Repository truth</p>
        <h3>Compact summary</h3>
        <p>Keep only the durable-record counts that help orient the current project.</p>
      </div>
    </div>

    <ul class="workspace-truth-list" role="list">
      <li v-for="item in summaryItems" :key="item.label">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </li>
    </ul>
  </section>
</template>
