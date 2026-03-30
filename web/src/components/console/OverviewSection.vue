<script setup lang="ts">
import Card from "primevue/card";
import Button from "primevue/button";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
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
</template>
