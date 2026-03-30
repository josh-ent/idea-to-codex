<script setup lang="ts">
import { onMounted } from "vue";

import Divider from "primevue/divider";
import Message from "primevue/message";

import IntakeSection from "./components/console/IntakeSection.vue";
import OverviewSection from "./components/console/OverviewSection.vue";
import PackageSection from "./components/console/PackageSection.vue";
import ProposalSection from "./components/console/ProposalSection.vue";
import ReviewSection from "./components/console/ReviewSection.vue";
import { useConsoleStore } from "./stores/console";

const store = useConsoleStore();

onMounted(() => {
  void store.loadStatus();
  void store.loadProposalQueue();
});
</script>

<template>
  <main class="shell">
    <OverviewSection />

    <Message v-if="store.lastError" severity="error" :closable="false">
      {{ store.lastError }}
    </Message>

    <Divider />
    <IntakeSection />

    <Divider />
    <ProposalSection />

    <Divider />
    <PackageSection />

    <Divider />
    <ReviewSection />
  </main>
</template>
