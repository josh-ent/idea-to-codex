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
              <span class="metric-label">Active Project</span>
              <strong>{{ store.status?.project.active_project?.name ?? "None" }}</strong>
            </div>
            <div>
              <span class="metric-label">Known Projects</span>
              <strong>{{ store.status?.project.known_projects.length ?? 0 }}</strong>
            </div>
            <div>
              <span class="metric-label">Decisions</span>
              <strong>{{ store.status?.validation.decisions.length ?? 0 }}</strong>
            </div>
            <div>
              <span class="metric-label">Tranches</span>
              <strong>{{ store.status?.validation.tranches.length ?? 0 }}</strong>
            </div>
            <div>
              <span class="metric-label">Proposal Sets</span>
              <strong>{{ store.status?.validation.proposalSets.length ?? 0 }}</strong>
            </div>
            <div>
              <span class="metric-label">Review Checkpoints</span>
              <strong>{{ store.status?.validation.reviews.length ?? 0 }}</strong>
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
      <template #title>Project Workspace</template>
      <template #content>
        <div class="status-columns">
          <div>
            <h3>Active project</h3>
            <div class="record-list">
              <article class="record-card">
                <div class="record-card__header">
                  <h3>{{ store.status?.project.active_project?.name ?? "No active project" }}</h3>
                  <Tag
                    :value="store.status?.project.active_project ? 'selected' : 'required'"
                    :severity="store.status?.project.active_project ? 'success' : 'warn'"
                  />
                </div>
                <p>
                  {{
                    store.status?.project.active_project?.path ??
                    "Create or open a project before using repository-governance features."
                  }}
                </p>
                <small v-if="store.status?.project.active_project">
                  Git repository:
                  {{ store.status?.project.active_project.is_git_repository ? "yes" : "no" }}
                </small>
              </article>

              <article
                v-for="project in store.status?.project.known_projects ?? []"
                :key="project.path"
                class="record-card"
              >
                <div class="record-card__header">
                  <h3>{{ project.name }}</h3>
                  <Tag :value="project.is_active ? 'active' : 'known'" />
                </div>
                <p>{{ project.path }}</p>
                <div class="panel-actions">
                  <Button
                    label="Open"
                    size="small"
                    text
                    :disabled="project.is_active"
                    :loading="store.isOpeningProject"
                    @click="
                      store.existingProjectPath = project.path;
                      store.openManagedProject();
                    "
                  />
                </div>
              </article>
            </div>
          </div>

          <div>
            <h3>New project</h3>
            <div class="record-list">
              <label class="control control--wide">
                <span>Project name</span>
                <input
                  v-model="store.newProjectName"
                  class="control__input"
                  placeholder="Example: Billing Console"
                />
              </label>
              <label class="control control--wide">
                <span>Project path</span>
                <input
                  v-model="store.newProjectPath"
                  class="control__input"
                  placeholder="../projects/billing-console"
                />
              </label>
              <div class="panel-actions">
                <Button
                  label="Create Project"
                  icon="pi pi-plus"
                  :loading="store.isCreatingProject"
                  @click="store.createManagedProject"
                />
              </div>

              <h3>Open existing project</h3>
              <label class="control control--wide">
                <span>Existing project path</span>
                <input
                  v-model="store.existingProjectPath"
                  class="control__input"
                  placeholder="../projects/existing-project"
                />
              </label>
              <div class="panel-actions">
                <Button
                  label="Open Project"
                  icon="pi pi-folder-open"
                  severity="secondary"
                  :loading="store.isOpeningProject"
                  @click="store.openManagedProject"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <Card v-if="store.hasActiveProject" class="panel panel--overview">
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

      <Card v-if="store.hasActiveProject" class="panel">
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

      <Card v-if="store.hasActiveProject" class="panel">
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

      <Card v-if="store.hasActiveProject" class="panel">
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

      <Card v-if="store.hasActiveProject" class="panel">
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
