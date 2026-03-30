<script setup lang="ts">
import { onMounted } from "vue";

import Button from "primevue/button";
import Card from "primevue/card";
import Divider from "primevue/divider";
import Message from "primevue/message";
import SelectButton from "primevue/selectbutton";
import Tag from "primevue/tag";

import { useConsoleStore } from "./stores/console";

const store = useConsoleStore();

const packageOptions = [
  { label: "Plan Package", value: "plan" },
  { label: "Execution Package", value: "execution" },
] as const;

onMounted(() => {
  void store.loadStatus();
  void store.loadProposalQueue();
});
</script>

<template>
  <main class="shell">
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">Operator Console</p>
        <h1>Repository truth first. Codex handoffs second.</h1>
        <p class="hero__lede">
          This console stays narrow on purpose: inspect the current project truth,
          check drift signals, approve durable truth updates, and generate Codex
          handoff packages without inventing a second workflow system.
        </p>
      </div>

      <div class="hero__meta">
        <Card>
          <template #content>
            <div class="metric-grid">
              <div>
                <span class="metric-label">Decisions</span>
                <strong>{{ store.status?.validation.decisions.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Tranches</span>
                <strong>{{ store.status?.validation.tranches.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Open Questions</span>
                <strong>{{ store.status?.validation.openQuestions.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Trace Links</span>
                <strong>{{ store.status?.validation.traceLinks.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Review Checkpoints</span>
                <strong>{{ store.status?.validation.reviews.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Proposal Sets</span>
                <strong>{{ store.status?.validation.proposalSets.length ?? 0 }}</strong>
              </div>
              <div>
                <span class="metric-label">Branch</span>
                <strong>{{ store.status?.repository_state.branch ?? "n/a" }}</strong>
              </div>
              <div>
                <span class="metric-label">Repo State</span>
                <strong>
                  {{
                    store.status?.repository_state.available
                      ? store.status?.repository_state.is_dirty
                        ? "Dirty"
                        : "Clean"
                      : "Unavailable"
                  }}
                </strong>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </section>

    <Message v-if="store.lastError" severity="error" :closable="false">
      {{ store.lastError }}
    </Message>

    <section class="grid">
      <Card class="panel panel--overview">
        <template #title>Project Status</template>
        <template #content>
          <div class="panel-actions">
            <Button
              label="Refresh Status"
              icon="pi pi-refresh"
              :loading="store.isLoading"
              @click="store.loadStatus"
            />
            <Tag
              :value="store.status?.errors.length ? 'Issues Found' : 'Repository Clean'"
              :severity="store.status?.errors.length ? 'danger' : 'success'"
            />
          </div>

          <div class="status-columns">
            <div>
              <h3>Repository State</h3>
              <ul class="bullet-list">
                <li v-if="store.status?.repository_state.available">
                  Branch: {{ store.status?.repository_state.branch ?? "detached" }}
                </li>
                <li v-if="store.status?.repository_state.available">
                  Head: {{ store.status?.repository_state.head ?? "unknown" }}
                </li>
                <li v-if="store.status?.repository_state.available">
                  Dirty files: {{ store.status?.repository_state.dirty_paths.length }}
                </li>
                <li
                  v-for="path in store.status?.repository_state.dirty_paths ?? []"
                  :key="path"
                >
                  {{ path }}
                </li>
                <li v-if="store.status && !store.status.repository_state.available">
                  Repository state unavailable.
                </li>
              </ul>
            </div>
            <div>
              <h3>Errors</h3>
              <ul class="bullet-list">
                <li v-for="error in store.status?.errors ?? []" :key="error">{{ error }}</li>
                <li v-if="!(store.status?.errors.length)">No validation errors.</li>
              </ul>
            </div>
            <div>
              <h3>Open Questions</h3>
              <ul class="bullet-list">
                <li
                  v-for="question in store.status?.validation.openQuestions ?? []"
                  :key="question"
                >
                  {{ question }}
                </li>
                <li v-if="!(store.status?.validation.openQuestions.length)">
                  No open plan questions.
                </li>
              </ul>
            </div>
          </div>
        </template>
      </Card>

      <Card class="panel">
        <template #title>Tranches</template>
        <template #content>
          <div class="record-list">
            <article
              v-for="tranche in store.status?.validation.tranches ?? []"
              :key="tranche.path"
              class="record-card"
            >
              <div class="record-card__header">
                <h3>{{ tranche.frontmatter?.id }}</h3>
                <Tag :value="String(tranche.frontmatter?.status ?? 'unknown')" />
              </div>
              <p>{{ tranche.frontmatter?.title }}</p>
              <small>{{ tranche.path }}</small>
            </article>
          </div>
        </template>
      </Card>

      <Card class="panel">
        <template #title>Decisions</template>
        <template #content>
          <div class="record-list">
            <article
              v-for="decision in store.status?.validation.decisions ?? []"
              :key="decision.path"
              class="record-card"
            >
              <div class="record-card__header">
                <h3>{{ decision.frontmatter?.id }}</h3>
                <Tag :value="String(decision.frontmatter?.status ?? 'unknown')" />
              </div>
              <p>{{ decision.frontmatter?.title }}</p>
              <small>{{ decision.path }}</small>
            </article>
          </div>
        </template>
      </Card>

      <Card class="panel">
        <template #title>Glossary Terms</template>
        <template #content>
          <div class="record-list">
            <article
              v-for="term in store.status?.validation.glossaryTerms ?? []"
              :key="term.term"
              class="record-card"
            >
              <div class="record-card__header">
                <h3>{{ term.term }}</h3>
                <Tag value="canonical" severity="contrast" />
              </div>
              <p>{{ term.definition }}</p>
              <small>{{ term.notes }}</small>
            </article>
          </div>
        </template>
      </Card>

      <Card class="panel">
        <template #title>Review Checkpoints</template>
        <template #content>
          <div class="record-list">
            <article
              v-for="review in store.status?.validation.reviews ?? []"
              :key="review.path"
              class="record-card"
            >
              <div class="record-card__header">
                <h3>{{ review.frontmatter?.id }}</h3>
                <Tag :value="String(review.frontmatter?.status ?? 'unknown')" />
              </div>
              <p>{{ review.frontmatter?.review_reason }}</p>
              <small>{{ review.path }}</small>
            </article>
          </div>
        </template>
      </Card>
    </section>

    <Divider />

    <section class="grid">
      <Card class="panel panel--overview">
        <template #title>Intake Analysis</template>
        <template #content>
          <div class="record-list">
            <label class="control control--wide">
              <span>Raw request</span>
              <textarea
                v-model="store.intakeRequest"
                class="control__textarea"
                rows="5"
                placeholder="Describe a product request, change, or problem statement."
              />
            </label>

            <div class="panel-actions">
              <Button
                label="Analyze Request"
                icon="pi pi-search"
                @click="store.analyzeIntakeRequest"
              />
            </div>

            <div v-if="store.intakeAnalysis" class="intake-results">
              <div>
                <h3>Summary</h3>
                <p>{{ store.intakeAnalysis.summary }}</p>
              </div>
              <div>
                <h3>Recommended tranche title</h3>
                <p>{{ store.intakeAnalysis.recommended_tranche_title }}</p>
              </div>
              <div>
                <h3>Affected artefacts</h3>
                <ul class="bullet-list">
                  <li
                    v-for="artifact in store.intakeAnalysis.affected_artifacts"
                    :key="artifact"
                  >
                    {{ artifact }}
                  </li>
                </ul>
              </div>
              <div>
                <h3>Material questions</h3>
                <div class="record-list">
                  <article
                    v-for="question in store.intakeAnalysis.material_questions"
                    :key="question.id"
                    class="record-card"
                  >
                    <div class="record-card__header">
                      <h3>{{ question.id }}</h3>
                      <Tag
                        :value="question.blocking ? 'blocking' : 'non-blocking'"
                        :severity="question.blocking ? 'danger' : 'warn'"
                      />
                    </div>
                    <p>{{ question.prompt }}</p>
                    <small>{{ question.default_recommendation }}</small>
                    <label class="control control--wide">
                      <span>Operator answer</span>
                      <textarea
                        :value="store.intakeAnswers[question.id] ?? ''"
                        class="control__textarea"
                        rows="3"
                        placeholder="Answer only if this question materially affects the request."
                        @input="
                          store.setIntakeAnswer(
                            question.id,
                            ($event.target as HTMLTextAreaElement).value,
                          )
                        "
                      />
                    </label>
                  </article>
                </div>
              </div>

              <div class="panel-actions">
                <Button
                  label="Generate Intake Proposal Set"
                  icon="pi pi-pencil"
                  :loading="store.isGeneratingProposal"
                  :disabled="store.hasUnansweredBlockingQuestions"
                  @click="store.generateIntakeProposalSetFromAnalysis"
                />
                <small v-if="store.hasUnansweredBlockingQuestions">
                  Blocking Material Questions still need answers before proposal generation.
                </small>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </section>

    <Divider />

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

    <Divider />

    <section class="package-console">
      <Card class="panel panel--package">
        <template #title>Package Generation</template>
        <template #content>
          <div class="package-controls">
            <label class="control">
              <span>Target tranche</span>
              <select v-model="store.selectedTrancheId" class="control__select">
                <option
                  v-for="option in store.trancheOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="control">
              <span>Package type</span>
              <SelectButton
                v-model="store.packageType"
                :options="packageOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
            </label>

            <Button
              label="Generate And Persist"
              icon="pi pi-bolt"
              :loading="store.isGeneratingPackage"
              @click="store.generateSelectedPackage"
            />
          </div>

          <div v-if="store.generatedPackage" class="package-output">
            <div class="package-output__meta">
              <Tag :value="store.generatedPackage.record.type" severity="success" />
              <strong>{{ store.generatedPackage.record.id }}</strong>
              <span>{{ store.generatedPackage.path }}</span>
            </div>
            <pre>{{ store.generatedPackage.content }}</pre>
          </div>
        </template>
      </Card>
    </section>

    <Divider />

    <section class="package-console">
      <Card class="panel panel--package">
        <template #title>Review Checkpoint</template>
        <template #content>
          <div class="package-controls">
            <label class="control">
              <span>Target tranche</span>
              <select v-model="store.selectedTrancheId" class="control__select">
                <option
                  v-for="option in store.trancheOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

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
            <pre>{{ store.generatedReview.content }}</pre>
          </div>
        </template>
      </Card>
    </section>
  </main>
</template>
