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
] as const;
</script>

<template>
  <section class="package-console">
    <Card class="panel panel--package">
      <template #title>Package Generation</template>
      <template #content>
        <div class="package-controls">
          <TrancheSelect
            v-model="store.selectedTrancheId"
            :options="store.trancheOptions"
          />

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

          <Button
            label="Refresh Package Set"
            icon="pi pi-sync"
            severity="secondary"
            :loading="store.isRefreshingPackageSet"
            @click="store.refreshSelectedPackageSet"
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

        <div v-if="store.generatedPackageSet" class="record-list">
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
      </template>
    </Card>
  </section>
</template>
