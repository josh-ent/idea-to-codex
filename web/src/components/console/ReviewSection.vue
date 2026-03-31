<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";
import TrancheSelect from "./TrancheSelect.vue";

const store = useConsoleStore();
</script>

<template>
  <section class="screen-grid screen-grid--package">
    <div v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <div class="empty-state">
        <h3>Select a project before generating review checkpoints.</h3>
        <p>Review output always comes from the active managed repository.</p>
      </div>
    </div>

    <template v-else>
      <div class="detail-grid panel--full">
        <article class="record-card">
          <div class="section-heading">
            <h3>Checkpoint</h3>
          </div>

          <div class="panel-flow">
            <TrancheSelect v-model="store.selectedTrancheId" :options="store.trancheOptions" />

            <Button
              label="Generate and persist"
              icon="pi pi-check-square"
              :loading="store.isGeneratingReview"
              @click="store.generateReviewCheckpoint"
            />
          </div>
        </article>

        <article class="record-card">
          <div class="section-heading">
            <h3>Output</h3>
          </div>

          <div v-if="store.generatedReview" class="panel-flow">
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

            <div v-if="store.reviewPackageRegenerationIds.length > 0" class="panel-actions">
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

            <div v-if="store.canGenerateReviewFollowUp" class="panel-actions">
              <Button
                label="Generate follow-up"
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

            <div v-if="store.generatedReview.record.missing_package_types.length > 0" class="panel-actions">
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

          <div v-else class="empty-state">
            <h3>No review checkpoint yet.</h3>
            <p>Generate a checkpoint to inspect drift, package coverage, and follow-up actions.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
