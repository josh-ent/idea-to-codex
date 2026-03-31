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
  <section class="panel workspace-panel">
    <div class="workspace-section__heading">
      <div>
        <p class="section-kicker">Repository summary</p>
        <h3>Compact durable-record view</h3>
        <p>The workspace home stays focused on access and health. Durable record browsing remains secondary.</p>
      </div>
    </div>

    <dl class="workspace-count-grid">
      <div v-for="item in summaryItems" :key="item.label" class="workspace-count-grid__item">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </div>
    </dl>
  </section>
</template>
