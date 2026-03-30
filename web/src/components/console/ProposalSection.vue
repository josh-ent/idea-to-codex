<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="grid">
    <Card class="panel">
      <template #title>Proposal Queue</template>
      <template #content>
        <div class="panel-actions">
          <Button
            label="Refresh Proposals"
            icon="pi pi-refresh"
            :loading="store.isLoadingProposals"
            @click="store.loadProposalQueue"
          />
          <Button
            label="Generate Review Follow-up"
            icon="pi pi-sparkles"
            :loading="store.isGeneratingProposal"
            @click="store.generateReviewProposalSetForSelectedTranche"
          />
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
          <article v-if="store.proposalSets.length === 0" class="record-card">
            <h3>No proposal sets yet.</h3>
            <p>Generate an intake or review proposal set to start approval-gated truth mutation.</p>
          </article>
        </div>
      </template>
    </Card>

    <Card class="panel panel--overview">
      <template #title>Proposal Detail</template>
      <template #content>
        <div v-if="store.selectedProposalSet" class="record-list">
          <div class="package-output__meta">
            <Tag :value="store.selectedProposalSet.record.status" />
            <strong>{{ store.selectedProposalSet.record.id }}</strong>
            <span>{{ store.selectedProposalSet.relativePath }}</span>
          </div>

          <div>
            <h3>Summary</h3>
            <p>{{ store.selectedProposalSet.summary }}</p>
          </div>

          <div>
            <h3>Source Context</h3>
            <pre>{{ store.selectedProposalSet.sourceContext }}</pre>
          </div>

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
              <div>
                <h4>Source Context</h4>
                <pre>{{ draft.sourceContext }}</pre>
              </div>
              <div>
                <h4>Proposed Content</h4>
                <pre>{{ draft.proposedContent }}</pre>
              </div>
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

        <p v-else>No proposal set selected.</p>
      </template>
    </Card>
  </section>
</template>
