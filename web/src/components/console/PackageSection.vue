<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
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
    <Card v-if="!store.hasActiveProject" class="panel panel--empty panel--full">
      <template #title>Package Generation</template>
      <template #content>
        <div class="empty-state">
          <h3>Select a project before generating packages.</h3>
          <p>
            Packages are derived from repository truth in the active managed project. Choose a
            project in the workspace screen first.
          </p>
        </div>
      </template>
    </Card>

    <template v-else>
      <Card class="panel panel--controls">
        <template #title>Package Generation</template>
        <template #content>
          <div class="panel-flow">
            <TrancheSelect
              v-model="store.selectedTrancheId"
              :options="store.trancheOptions"
            />

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
                label="Generate And Persist"
                icon="pi pi-bolt"
                :loading="store.isGeneratingPackage"
                @click="store.generateSelectedPackage"
              />

              <Button
                label="Refresh Package Set"
                icon="pi pi-sync"
                severity="secondary"
                :loading="store.isRefreshingPackageSet"
                @click="store.refreshSelectedPackageSet"
              />
            </div>

            <div class="record-card record-card--info">
              <h3>Desktop rule</h3>
              <p>
                Long package content stays inside bounded code panes so the primary screen stays
                within the viewport.
              </p>
            </div>
          </div>
        </template>
      </Card>

      <Card class="panel panel--detail">
        <template #title>Generated Output</template>
        <template #content>
          <div v-if="store.generatedPackage" class="panel-flow">
            <div class="package-output__meta">
              <Tag :value="store.generatedPackage.record.type" severity="success" />
              <strong>{{ store.generatedPackage.record.id }}</strong>
              <span>{{ store.generatedPackage.path }}</span>
            </div>
            <pre>{{ store.generatedPackage.content }}</pre>
          </div>

          <div v-else-if="store.generatedPackageSet" class="record-list record-list--scroll">
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
            <p>Select a tranche and generate a package or refresh the full package set.</p>
          </div>
        </template>
      </Card>
    </template>
  </section>
</template>
