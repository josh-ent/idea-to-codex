<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";
import TrancheSelect from "./TrancheSelect.vue";

const store = useConsoleStore();
</script>

<template>
  <section class="package-console">
    <Card class="panel panel--package">
      <template #title>Review Checkpoint</template>
      <template #content>
        <div class="package-controls">
          <TrancheSelect
            v-model="store.selectedTrancheId"
            :options="store.trancheOptions"
          />

          <Button
            label="Generate And Persist"
            icon="pi pi-check-square"
            :loading="store.isGeneratingReview"
            @click="store.generateReviewCheckpoint"
          />
        </div>

        <div v-if="store.generatedReview" class="package-output">
          <div class="package-output__meta">
            <Tag
              :value="store.generatedReview.record.status"
              :severity="
                store.generatedReview.record.status === 'attention_required'
                  ? 'danger'
                  : 'success'
              "
            />
            <strong>{{ store.generatedReview.record.id }}</strong>
            <span>{{ store.generatedReview.path }}</span>
          </div>
          <div
            v-if="store.reviewPackageRegenerationIds.length > 0"
            class="panel-actions"
          >
            <Button
              v-for="packageId in store.reviewPackageRegenerationIds"
              :key="packageId"
              :label="`Regenerate ${packageId}`"
              icon="pi pi-refresh"
              size="small"
              :loading="store.isGeneratingPackage"
              @click="
                store.regeneratePackageFromReview(
                  packageId,
                  store.generatedReview.record.source_tranche,
                )
              "
            />
          </div>
          <div
            v-if="store.canGenerateReviewFollowUp"
            class="panel-actions"
          >
            <Button
              label="Generate Review Follow-up"
              icon="pi pi-sparkles"
              size="small"
              severity="secondary"
              :loading="store.isGeneratingProposal"
              @click="
                store.generateReviewProposalSetForTranche(
                  store.generatedReview.record.source_tranche,
                )
              "
            />
          </div>
          <div
            v-if="store.generatedReview.record.missing_package_types.length > 0"
            class="panel-actions"
          >
            <Button
              v-for="packageType in store.generatedReview.record.missing_package_types"
              :key="packageType"
              :label="`Generate ${packageType} package`"
              icon="pi pi-plus-circle"
              size="small"
              :loading="store.isGeneratingPackage"
              @click="
                store.generatePackageFor(
                  packageType,
                  store.generatedReview.record.source_tranche,
                )
              "
            />
          </div>
          <pre>{{ store.generatedReview.content }}</pre>
        </div>
      </template>
    </Card>
  </section>
</template>
