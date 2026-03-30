<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
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
                      @input="store.setIntakeAnswerFromEvent(question.id, $event)"
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
</template>
