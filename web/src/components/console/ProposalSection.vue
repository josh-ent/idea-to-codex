<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="screen-grid screen-grid--proposal">
    <div v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <div class="empty-state">
        <h3>Select a project before reviewing proposals.</h3>
        <p>Proposal sets belong to the active managed repository.</p>
      </div>
    </div>

    <template v-else>
      <div class="detail-grid panel--full">
        <article class="record-card">
          <div class="section-heading">
            <div>
              <h3>Queue</h3>
              <small>{{ store.proposalSets.length }} set(s)</small>
            </div>
            <div class="panel-actions">
              <Button
                label="Refresh queue"
                icon="pi pi-refresh"
                :loading="store.isLoadingProposals"
                @click="() => store.loadProposalQueue()"
              />
              <Button
                label="Generate follow-up"
                icon="pi pi-sparkles"
                :loading="store.isGeneratingProposal"
                @click="store.generateReviewProposalSetForSelectedTranche"
              />
            </div>
          </div>

          <div class="record-list">
            <article
              v-for="proposal in store.proposalSets"
              :key="proposal.id"
              class="record-card"
            >
              <div class="record-card__header">
                <h3>{{ proposal.id }}</h3>
                <Tag :value="proposal.record.status" />
              </div>
              <p>{{ proposal.record.source_type }}: {{ proposal.record.source_ref }}</p>
              <small>{{ proposal.draft_count }} draft(s)</small>
              <div class="panel-actions">
                <Button
                  label="Open"
                  size="small"
                  text
                  @click="store.loadProposalSet(proposal.id)"
                />
              </div>
            </article>

            <article v-if="store.proposalSets.length === 0" class="record-card record-card--empty">
              <h3>No proposal sets yet.</h3>
              <p>Run intake or review follow-up generation to create a draft set.</p>
            </article>
          </div>
        </article>

        <article class="record-card">
          <div class="section-heading">
            <h3>Selected set</h3>
          </div>

          <div v-if="store.selectedProposalSet" class="panel-flow">
            <div class="package-output__meta">
              <Tag :value="store.selectedProposalSet.record.status" />
              <strong>{{ store.selectedProposalSet.record.id }}</strong>
              <span>{{ store.selectedProposalSet.relativePath }}</span>
            </div>

            <p>{{ store.selectedProposalSet.summary }}</p>
            <pre>{{ store.selectedProposalSet.sourceContext }}</pre>

            <div class="record-list">
              <article
                v-for="draft in store.selectedProposalSet.drafts"
                :key="draft.id"
                class="record-card"
              >
                <div class="record-card__header">
                  <h3>{{ draft.id }}</h3>
                  <Tag :value="draft.record.status" />
                </div>
                <p>{{ draft.summary }}</p>
                <small>{{ draft.record.target_artifact }}</small>
                <pre>{{ draft.proposedContent }}</pre>
                <div class="panel-actions">
                  <Button
                    label="Approve"
                    icon="pi pi-check"
                    :loading="store.activeProposalMutationId === draft.id"
                    :disabled="draft.record.status !== 'draft'"
                    @click="store.mutateProposal(draft.id, 'approve')"
                  />
                  <Button
                    label="Reject"
                    icon="pi pi-times"
                    severity="secondary"
                    :loading="store.activeProposalMutationId === draft.id"
                    :disabled="draft.record.status !== 'draft'"
                    @click="store.mutateProposal(draft.id, 'reject')"
                  />
                </div>
              </article>
            </div>
          </div>

          <div v-else class="empty-state">
            <h3>No proposal set selected.</h3>
            <p>Open a set from the queue to inspect the drafts and approve or reject them.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
