<script setup lang="ts">
defineProps<{
  modelValue: string;
  options: Array<{ label: string; value: string }>;
  label?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function updateValue(event: Event) {
  const target = event.target;

  if (target instanceof HTMLSelectElement) {
    emit("update:modelValue", target.value);
  }
}
</script>

<template>
  <label class="control">
    <span>{{ label ?? "Target tranche" }}</span>
    <select :value="modelValue" class="control__select" @change="updateValue">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
