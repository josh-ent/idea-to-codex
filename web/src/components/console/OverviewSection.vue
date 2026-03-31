<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Panel from "primevue/panel";
import ScrollPanel from "primevue/scrollpanel";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="screen-column">
    <div v-if="store.hasActiveProject" class="metric-strip">
      <Card class="metric-card">
        <template #content>
          <span class="metric-card__label">Known Projects</span>
          <strong>{{ store.status?.project.known_projects.length ?? 0 }}</strong>
        </template>
      </Card>
      <Card class="metric-card">
        <template #content>
          <span class="metric-card__label">Tranches</span>
          <strong>{{ store.status?.validation.tranches.length ?? 0 }}</strong>
        </template>
      </Card>
      <Card class="metric-card">
        <template #content>
          <span class="metric-card__label">Decisions</span>
          <strong>{{ store.status?.validation.decisions.length ?? 0 }}</strong>
        </template>
      </Card>
      <Card class="metric-card">
        <template #content>
          <span class="metric-card__label">Review Checkpoints</span>
          <strong>{{ store.status?.validation.reviews.length ?? 0 }}</strong>
        </template>
      </Card>
    </div>

    <div class="overview-layout">
      <Panel header="Project Workspace" class="panel panel--workspace">
        <div class="workspace-layout">
          <div class="workspace-column">
            <div class="section-heading">
              <h3>Active project</h3>
              <Tag
                :value="store.status?.project.active_project ? 'selected' : 'required'"
                :severity="store.status?.project.active_project ? 'success' : 'warn'"
              />
            </div>

            <div class="record-list">
              <article class="record-card">
                <div class="record-card__header">
                  <h3>{{ store.status?.project.active_project?.name ?? "No active project" }}</h3>
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
            </div>

            <div class="section-heading">
              <h3>Known projects</h3>
              <small>{{ store.status?.project.known_projects.length ?? 0 }} tracked</small>
            </div>

            <ScrollPanel class="scroll-region">
              <div class="record-list">
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

                <article
                  v-if="!(store.status?.project.known_projects.length)"
                  class="record-card record-card--empty"
                >
                  <h3>No known projects yet.</h3>
                  <p>Create or open a project to seed the workspace list.</p>
                </article>
              </div>
            </ScrollPanel>
          </div>

          <div class="workspace-column">
            <div class="section-heading">
              <h3>New project</h3>
              <small>Create a managed repository and select it immediately.</small>
            </div>

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
                <div class="control-row">
                  <input
                    v-model="store.newProjectPath"
                    class="control__input"
                    placeholder="../projects/billing-console"
                  />
                  <Button
                    label="Browse"
                    icon="pi pi-folder-open"
                    severity="secondary"
                    :loading="store.isSelectingProjectPath"
                    @click="
                      store.selectProjectDirectory(
                        'new',
                        'Select the folder to use as the new project path',
                      )
                    "
                  />
                </div>
              </label>
              <Button
                label="Create Project"
                icon="pi pi-plus"
                :loading="store.isCreatingProject"
                @click="store.createManagedProject"
              />
            </div>

            <div class="section-heading">
              <h3>Open existing project</h3>
              <small>Point the console at a local repository that already exists.</small>
            </div>

            <div class="record-list">
              <label class="control control--wide">
                <span>Existing project path</span>
                <div class="control-row">
                  <input
                    v-model="store.existingProjectPath"
                    class="control__input"
                    placeholder="../projects/existing-project"
                  />
                  <Button
                    label="Browse"
                    icon="pi pi-folder-open"
                    severity="secondary"
                    :loading="store.isSelectingProjectPath"
                    @click="
                      store.selectProjectDirectory(
                        'existing',
                        'Select an existing managed project folder',
                      )
                    "
                  />
                </div>
              </label>
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
      </Panel>

      <Panel v-if="store.hasActiveProject" header="Repository Signals" class="panel panel--signals">
        <div class="status-stack">
          <section class="signal-card">
            <div class="section-heading">
              <h3>Repository state</h3>
              <Tag
                :value="store.status?.repository_state.is_dirty ? 'dirty' : 'clean'"
                :severity="store.status?.repository_state.is_dirty ? 'warn' : 'success'"
              />
            </div>
            <ul class="bullet-list">
              <li>Branch: {{ store.status?.repository_state.branch ?? "detached" }}</li>
              <li>Head: {{ store.status?.repository_state.head ?? "unknown" }}</li>
              <li>Dirty files: {{ store.status?.repository_state.dirty_paths.length ?? 0 }}</li>
            </ul>
          </section>

          <section class="signal-card">
            <div class="section-heading">
              <h3>Validation errors</h3>
              <Tag
                :value="store.status?.errors.length ? 'issues found' : 'clear'"
                :severity="store.status?.errors.length ? 'danger' : 'success'"
              />
            </div>
            <ScrollPanel class="scroll-region scroll-region--compact">
              <ul class="bullet-list">
                <li v-for="error in store.status?.errors ?? []" :key="error">{{ error }}</li>
                <li v-if="!(store.status?.errors.length)">No validation errors.</li>
              </ul>
            </ScrollPanel>
          </section>

          <section class="signal-card">
            <div class="section-heading">
              <h3>Open questions</h3>
              <Tag
                :value="store.status?.validation.openQuestions.length ? 'open' : 'resolved'"
                :severity="store.status?.validation.openQuestions.length ? 'warn' : 'success'"
              />
            </div>
            <ScrollPanel class="scroll-region scroll-region--compact">
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
            </ScrollPanel>
          </section>
        </div>
      </Panel>
    </div>

    <Panel v-if="store.hasActiveProject" header="Repository Records" class="panel panel--fill">
      <Tabs value="tranches" class="records-tabs">
        <TabList>
          <Tab value="tranches">Tranches</Tab>
          <Tab value="decisions">Decisions</Tab>
          <Tab value="glossary">Glossary</Tab>
          <Tab value="reviews">Reviews</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="tranches">
            <ScrollPanel class="scroll-region">
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
            </ScrollPanel>
          </TabPanel>

          <TabPanel value="decisions">
            <ScrollPanel class="scroll-region">
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
            </ScrollPanel>
          </TabPanel>

          <TabPanel value="glossary">
            <ScrollPanel class="scroll-region">
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
            </ScrollPanel>
          </TabPanel>

          <TabPanel value="reviews">
            <ScrollPanel class="scroll-region">
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
            </ScrollPanel>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Panel>

    <Panel v-else header="Next Step" class="panel panel--fill">
      <div class="empty-state">
        <h3>Select or create a managed project.</h3>
        <p>
          The console stays intentionally narrow until a repository is active. Use the workspace
          controls above to create a new project or open an existing one.
        </p>
      </div>
    </Panel>
  </section>
</template>
