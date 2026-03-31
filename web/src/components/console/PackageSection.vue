<script setup lang="ts">
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import Tag from "primevue/tag";

import { useConsoleStore } from "../../stores/console";
import TrancheSelect from "./TrancheSelect.vue";

const store = useConsoleStore();

const packageOptions = [
  { label: "Plan Package", value: "plan" },
  { label: "Execution Package", value: "execution" },
];
</script>

<template>
  <section class="screen-grid screen-grid--package">
    <div v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <div class="empty-state">
        <h3>Select a project before generating packages.</h3>
        <p>Packages come from repository truth in the active managed project.</p>
      </div>
    </div>

    <template v-else>
      <div class="detail-grid panel--full">
        <article class="record-card">
          <div class="section-heading">
            <h3>Controls</h3>
          </div>

          <div class="panel-flow">
            <TrancheSelect v-model="store.selectedTrancheId" :options="store.trancheOptions" />

            <label class="control control--wide">
              <span>Package type</span>
              <SelectButton
                v-model="store.packageType"
                :options="packageOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
              />
            </label>

            <div class="panel-actions">
              <Button
                label="Generate and persist"
                icon="pi pi-bolt"
                :loading="store.isGeneratingPackage"
                @click="store.generateSelectedPackage"
              />

              <Button
                label="Refresh package set"
                icon="pi pi-sync"
                severity="secondary"
                :loading="store.isRefreshingPackageSet"
                @click="store.refreshSelectedPackageSet"
              />
            </div>
          </div>
        </article>

        <article class="record-card">
          <div class="section-heading">
            <h3>Output</h3>
          </div>

          <div v-if="store.generatedPackage" class="panel-flow">
            <div class="package-output__meta">
              <Tag :value="store.generatedPackage.record.type" severity="success" />
              <strong>{{ store.generatedPackage.record.id }}</strong>
              <span>{{ store.generatedPackage.path }}</span>
            </div>
            <pre>{{ store.generatedPackage.content }}</pre>
          </div>

          <div v-else-if="store.generatedPackageSet" class="record-list">
            <article
              v-for="pkg in store.generatedPackageSet.packages"
              :key="pkg.id"
              class="package-output"
            >
              <div class="package-output__meta">
                <Tag :value="pkg.record.type" severity="success" />
                <strong>{{ pkg.record.id }}</strong>
                <span>{{ pkg.path }}</span>
              </div>
              <pre>{{ pkg.content }}</pre>
            </article>
          </div>

          <div v-else class="empty-state">
            <h3>No package output yet.</h3>
            <p>Select a tranche and generate a handoff package.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
