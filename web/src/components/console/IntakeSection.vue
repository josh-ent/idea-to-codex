<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();
</script>

<template>
  <section class="screen-grid screen-grid--intake">
    <div v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <div class="empty-state">
        <h3>Select a project before running intake.</h3>
        <p>Intake always writes into the active managed repository.</p>
      </div>
    </div>

    <template v-else>
      <div class="detail-grid panel--full">
        <article class="record-card">
          <div class="section-heading">
            <h3>Request</h3>
          </div>

          <label class="control control--wide">
            <span>Raw request</span>
            <textarea
              v-model="store.intakeRequest"
              class="control__textarea"
              rows="8"
              placeholder="Describe the change, problem, or request."
            />
          </label>

          <div class="panel-actions">
            <Button
              label="Analyze request"
              icon="pi pi-search"
              @click="store.analyzeIntakeRequest"
            />
          </div>
        </article>

        <article class="record-card">
          <div class="section-heading">
            <h3>Bounded output</h3>
          </div>

          <template v-if="store.intakeAnalysis">
            <p>{{ store.intakeAnalysis.summary }}</p>
            <ul class="bullet-list">
              <li>
                <strong>Recommended tranche:</strong>
                {{ store.intakeAnalysis.recommended_tranche_title }}
              </li>
              <li>
                <strong>Affected artefacts:</strong>
                {{ store.intakeAnalysis.affected_artifacts.join(", ") || "None identified" }}
              </li>
              <li>
                <strong>Affected modules:</strong>
                {{ store.intakeAnalysis.affected_modules.join(", ") || "None identified" }}
              </li>
              <li>
                <strong>Draft assumptions:</strong>
                {{ store.intakeAnalysis.draft_assumptions.join(", ") || "None proposed" }}
              </li>
            </ul>
          </template>

          <div v-else class="empty-state">
            <h3>No analysis yet.</h3>
            <p>Run analysis after entering the request to see artefact impact and assumptions.</p>
          </div>
        </article>
      </div>

      <section class="panel panel--full">
        <div class="section-heading">
          <div>
            <h3>Material questions</h3>
            <p>Only questions that affect product meaning, workflow, or irreversible choices.</p>
          </div>
        </div>

        <div v-if="store.intakeAnalysis" class="record-list">
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
                placeholder="Answer only when it changes the request meaning."
                @input="store.setIntakeAnswerFromEvent(question.id, $event)"
              />
            </label>
          </article>

          <article
            v-if="store.intakeAnalysis.material_questions.length === 0"
            class="record-card record-card--empty"
          >
            <h3>No material questions.</h3>
            <p>The request is already bounded enough to move into proposal generation.</p>
          </article>

          <div class="panel-actions">
            <Button
              label="Generate proposal set"
              icon="pi pi-pencil"
              :loading="store.isGeneratingProposal"
              :disabled="store.hasUnansweredBlockingQuestions"
              @click="store.generateIntakeProposalSetFromAnalysis"
            />
            <small v-if="store.hasUnansweredBlockingQuestions">
              Blocking questions still need answers before proposal generation.
            </small>
          </div>
        </div>

        <div v-else class="empty-state">
          <h3>Questions appear after analysis.</h3>
          <p>This section stays empty until the request has been structured.</p>
        </div>
      </section>
    </template>
  </section>
</template>
