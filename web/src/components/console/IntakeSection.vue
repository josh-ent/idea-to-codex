<script setup lang="ts">
import { computed } from "vue";

import Button from "primevue/button";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";

const store = useConsoleStore();

const briefSections = computed(() => {
  const entries = store.currentIntakeBriefEntries;
  const grouped = new Map<string, typeof entries>();

  for (const entry of entries) {
    const current = grouped.get(entry.entry_type) ?? [];
    grouped.set(entry.entry_type, [...current, entry]);
  }

  return Array.from(grouped.entries()).map(([entryType, sectionEntries]) => ({
    entryType,
    entries: sectionEntries,
  }));
});

const questionLineageByQuestionId = computed(() =>
  new Map(
    store.currentIntakeQuestionLineage.map((entry) => [
      entry.from_question_id,
      entry,
    ]),
  ),
);

function formatSessionStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function formatEntryType(value: string): string {
  return value.replace(/_/g, " ");
}

function formatQuestionStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function formatQuestionId(questionId: string): string {
  return questionId.length > 12 ? questionId.slice(0, 12) : questionId;
}

function formatProvenanceType(value: string): string {
  return value.replace(/_/g, " ");
}

function formatProvenanceDetail(value: Record<string, unknown>): string {
  const entries = Object.entries(value).filter(([, entry]) => entry !== null && entry !== "");

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`)
    .join(" | ");
}
</script>

<template>
  <section class="screen-grid screen-grid--intake">
    <div v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <div class="empty-state">
        <h3>Select a project before running intake.</h3>
        <p>Intake works against the active project scope.</p>
      </div>
    </div>

    <template v-else>
      <div class="detail-grid panel--full">
        <article class="record-card">
          <div class="section-heading">
            <div>
              <h3>Intake request</h3>
              <p>Start a session from a raw request, then continue it with answers or notes.</p>
            </div>
            <Tag
              :value="store.intakeSession ? formatSessionStatus(store.intakeSession.session.status) : 'idle'"
              :severity="store.intakeSession ? 'success' : 'secondary'"
            />
          </div>

          <label class="control control--wide">
            <span>Raw request</span>
            <textarea
              v-model="store.intakeRequest"
              class="control__textarea"
              rows="6"
              placeholder="Describe the problem or change you want to brief."
              :disabled="Boolean(store.intakeSession)"
            />
          </label>

          <label class="control control--wide">
            <span>Continue notes</span>
            <textarea
              v-model="store.intakeOperatorNotes"
              class="control__textarea"
              rows="4"
              placeholder="Add notes for the next intake turn."
              :disabled="!store.canEditIntakeNotes"
            />
          </label>

          <label class="control control--wide">
            <span>Finalise note</span>
            <textarea
              v-model="store.intakeFinalizeNote"
              class="control__textarea"
              rows="3"
              placeholder="Optional note for finalising the intake brief."
              :disabled="!store.canEditIntakeNotes"
            />
          </label>

          <div class="panel-actions">
            <Button
              v-if="!store.intakeSession"
              label="Start intake"
              icon="pi pi-play"
              :loading="store.isStartingIntakeSession"
              :disabled="!store.canStartIntakeSession"
              @click="store.startIntakeSession"
            />
            <Button
              v-else
              label="Continue intake"
              icon="pi pi-refresh"
              :loading="store.isContinuingIntakeSession"
              :disabled="!store.canContinueIntakeSession"
              @click="store.continueIntakeSession"
            />
            <Button
              v-if="store.intakeSession"
              label="Finalise intake"
              icon="pi pi-check"
              :loading="store.isFinalizingIntakeSession"
              :disabled="!store.canFinalizeIntakeSession"
              @click="store.finalizeIntakeSession"
            />
            <Button
              v-if="store.intakeSession"
              label="Abandon"
              severity="secondary"
              icon="pi pi-times"
              :loading="store.isAbandoningIntakeSession"
              :disabled="!store.canAbandonIntakeSession"
              @click="store.abandonIntakeSession"
            />
          </div>

          <small v-if="!store.intakeSession">
            Once started, the session owns the brief and questions for this project scope.
          </small>
          <small v-else-if="store.isIntakeSessionActive">
            Finalising stays available while the session is active. Unanswered questions may be
            closed by finalization as accepted without answer.
          </small>
          <small v-else>
            This session is terminal. Start a new intake session in this scope to continue briefing.
          </small>
        </article>

        <article class="record-card">
          <div class="section-heading">
            <div>
              <h3>Session state</h3>
              <p>Compact metadata for the active intake workflow.</p>
            </div>
          </div>

          <template v-if="store.intakeSession">
            <ul class="bullet-list">
              <li><strong>Session id:</strong> {{ store.intakeSession.session.id }}</li>
              <li><strong>Status:</strong> {{ formatSessionStatus(store.intakeSession.session.status) }}</li>
              <li><strong>Revision:</strong> {{ store.intakeSession.session_revision }}</li>
              <li><strong>Scope:</strong> {{ store.intakeSession.session.scope_key }}</li>
              <li>
                <strong>Scope fallback:</strong>
                {{ store.intakeSession.session.scope_fallback_mode.replace(/_/g, " ") }}
              </li>
            </ul>
          </template>

          <div v-else class="empty-state">
            <h3>No active intake session.</h3>
            <p>Start one from the request panel to begin briefing the project.</p>
          </div>
        </article>
      </div>

      <section class="panel panel--full">
        <div class="section-heading">
          <div>
            <h3>Current brief</h3>
            <p>Structured brief entries are the authoritative intake output.</p>
          </div>
        </div>

        <div v-if="store.currentIntakeBrief" class="record-list">
          <article class="record-card">
            <div class="record-card__header">
              <h3>Brief version {{ store.currentIntakeBrief.brief_version_number }}</h3>
              <Tag :value="store.currentIntakeBrief.status" severity="info" />
            </div>
            <p class="content-lines">{{ store.currentIntakeBrief.rendered_markdown }}</p>
          </article>
        </div>

        <div v-if="briefSections.length" class="record-list">
          <article v-for="section in briefSections" :key="section.entryType" class="record-card">
            <div class="record-card__header">
              <h3>{{ formatEntryType(section.entryType) }}</h3>
              <span class="muted">{{ section.entries.length }} item(s)</span>
            </div>

            <div class="record-list record-list--compact">
              <article v-for="entry in section.entries" :key="entry.id" class="record-card record-card--compact">
                <p class="content-lines">{{ entry.rendered_markdown }}</p>
                <div class="record-card__meta">
                  <Tag
                    v-for="provenance in entry.provenance_entries"
                    :key="`${entry.id}-${provenance.provenance_type}-${provenance.label}`"
                    :value="formatProvenanceType(provenance.provenance_type)"
                    severity="secondary"
                  />
                </div>
                <small
                  v-for="provenance in entry.provenance_entries"
                  :key="`${entry.id}-${provenance.label}-detail`"
                  class="content-meta"
                >
                  {{ provenance.label }}
                  <span v-if="formatProvenanceDetail(provenance.detail)">
                    · {{ formatProvenanceDetail(provenance.detail) }}
                  </span>
                </small>
                <small v-if="entry.provenance_summary" class="content-meta">
                  Summary: {{ entry.provenance_summary }}
                </small>
              </article>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <h3>No brief yet.</h3>
          <p>Start intake to generate the first project brief.</p>
        </div>
      </section>

      <section class="panel panel--full">
        <div class="section-heading">
          <div>
            <h3>Questions</h3>
            <p>Questions are session-local and may be retained, superseded, or accepted as-is.</p>
          </div>
        </div>

        <div v-if="store.currentIntakeQuestions.length" class="record-list">
          <article
            v-for="(question, index) in store.currentIntakeQuestions"
            :key="question.id"
            class="record-card"
          >
            <div class="record-card__header">
              <h3>{{ question.display_id || `Question ${index + 1}` }}</h3>
              <Tag :value="formatQuestionStatus(question.status)" severity="warn" />
            </div>

            <p class="content-lines">{{ question.current_prompt }}</p>
            <small class="content-meta">{{ question.current_rationale_markdown }}</small>

            <div class="record-card__meta">
              <Tag :value="question.importance" severity="info" />
              <Tag
                v-for="tag in question.tags"
                :key="`${question.id}-${tag}`"
                :value="tag"
                severity="secondary"
              />
              <Tag
                v-for="provenance in question.provenance_entries"
                :key="`${question.id}-${provenance.provenance_type}-${provenance.label}`"
                :value="formatProvenanceType(provenance.provenance_type)"
                severity="secondary"
              />
            </div>

            <label class="control control--wide">
              <span>Answer</span>
              <textarea
                :value="store.intakeQuestionAnswers[question.id] ?? ''"
                class="control__textarea"
                rows="3"
                placeholder="Answer this question if it matters for the final brief."
                :disabled="!store.canEditIntakeQuestionAnswers"
                @input="store.setIntakeQuestionAnswerFromEvent(question.id, $event)"
              />
            </label>

            <small class="content-meta">
              Stable id: {{ formatQuestionId(question.id) }}
            </small>
            <small
              v-for="provenance in question.provenance_entries"
              :key="`${question.id}-${provenance.label}-detail`"
              class="content-meta"
            >
              {{ provenance.label }}
              <span v-if="formatProvenanceDetail(provenance.detail)">
                · {{ formatProvenanceDetail(provenance.detail) }}
              </span>
            </small>
            <small
              v-if="questionLineageByQuestionId.get(question.id)"
              class="content-meta"
            >
              Lineage:
              {{ questionLineageByQuestionId.get(question.id)?.relation_type.replace(/_/g, " ") }}
              <span v-if="questionLineageByQuestionId.get(question.id)?.to_question_id">
                to {{ formatQuestionId(questionLineageByQuestionId.get(question.id)?.to_question_id ?? "") }}
              </span>
            </small>
          </article>
        </div>

        <div v-else class="empty-state">
          <h3>No questions yet.</h3>
          <p>The intake model may decide the project brief is already strong enough.</p>
        </div>
      </section>
    </template>
  </section>
</template>
