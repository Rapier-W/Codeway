<script setup lang="ts">
defineProps<{ modelValue: { origin: string; destination: string } }>()
const emit = defineEmits<{ 'update:modelValue': [value: { origin: string; destination: string }]; close: [] }>()
</script>
<template>
  <div class="sheet-backdrop" @click.self="emit('close')"><section class="sheet" role="dialog" aria-label="筛选行程"><h2>筛选行程</h2><label>出发地<input :value="modelValue.origin" @input="emit('update:modelValue', { ...modelValue, origin: ($event.target as HTMLInputElement).value })" /></label><label>目的地<input :value="modelValue.destination" @input="emit('update:modelValue', { ...modelValue, destination: ($event.target as HTMLInputElement).value })" /></label><button class="primary-button" @click="emit('close')">应用筛选</button></section></div>
</template>
