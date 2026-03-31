<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="screen-grid screen-grid--intake">
    <Card v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <template #title>Request Intake</template>
      <template #content>
        <div class="empty-state">
          <h3>Select a project before running intake.</h3>
          <p>
            Intake output is project-scoped. Activate a managed repository in the workspace
            screen first, then return here.
          </p>
        </div>
      </template>
    </Card>

    <template v-else>
      <Card class="panel">
        <template #title>Intake Analysis</template>
        <template #content>
          <div class="record-list">
            <label class="control control--wide">
              <span>Raw request</span>
              <textarea
                v-model="store.intakeRequest"
                class="control__textarea"
                rows="8"
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

            <div v-if="store.intakeAnalysis" class="detail-grid">
              <div class="record-card">
                <h3>Summary</h3>
                <p>{{ store.intakeAnalysis.summary }}</p>
              </div>
              <div class="record-card">
                <h3>Recommended tranche title</h3>
                <p>{{ store.intakeAnalysis.recommended_tranche_title }}</p>
              </div>
              <div class="record-card">
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
              <div class="record-card">
                <h3>Affected modules</h3>
                <ul class="bullet-list">
                  <li
                    v-for="moduleName in store.intakeAnalysis.affected_modules"
                    :key="moduleName"
                  >
                    {{ moduleName }}
                  </li>
                  <li v-if="store.intakeAnalysis.affected_modules.length === 0">
                    No affected modules identified yet.
                  </li>
                </ul>
              </div>
              <div class="record-card">
                <h3>Draft assumptions</h3>
                <ul class="bullet-list">
                  <li
                    v-for="assumption in store.intakeAnalysis.draft_assumptions"
                    :key="assumption"
                  >
                    {{ assumption }}
                  </li>
                  <li v-if="store.intakeAnalysis.draft_assumptions.length === 0">
                    No draft assumptions proposed.
                  </li>
                </ul>
              </div>
            </div>

            <div v-else class="empty-state">
              <h3>No intake analysis yet.</h3>
              <p>
                Start with a raw request, run analysis, then use the generated questions and
                proposal action on the right.
              </p>
            </div>
          </div>
        </template>
      </Card>

      <Card class="panel">
        <template #title>Material Questions</template>
        <template #content>
          <div v-if="store.intakeAnalysis" class="panel-flow">
            <div class="record-list record-list--scroll">
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
                    @input="store.setIntakeAnswerFromEvent(question.id, $event)"
                  />
                </label>
              </article>

              <article
                v-if="store.intakeAnalysis.material_questions.length === 0"
                class="record-card record-card--empty"
              >
                <h3>No material questions.</h3>
                <p>The request is already bounded enough to move directly into proposal generation.</p>
              </article>
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
                Blocking material questions still need answers before proposal generation.
              </small>
            </div>
          </div>

          <div v-else class="empty-state">
            <h3>Questions appear after analysis.</h3>
            <p>
              This panel is reserved for blocking decisions and operator answers, so it stays
              clear until a request has been analyzed.
            </p>
          </div>
        </template>
      </Card>
    </template>
  </section>
</template>
