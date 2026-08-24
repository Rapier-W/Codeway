<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
const props = defineProps<{ open: boolean; busy?: boolean; error?: string }>()
const emit = defineEmits<{ close: []; submit: [count: 1 | 2] }>()
const count = ref<1 | 2>(1)
const sheet = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null
function close() { emit('close'); previouslyFocused?.focus(); previouslyFocused = null }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') close() }
watch(() => props.open, async (open) => {
  if (open) {
    previouslyFocused = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKeydown)
    await nextTick(); sheet.value?.focus()
  } else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>
<template><div v-if="props.open" class="sheet-backdrop" @click.self="close"><section ref="sheet" class="sheet" role="dialog" aria-modal="true" aria-label="申请加入" tabindex="-1"><h2>申请加入</h2><p>选择你需要的席位数，发单人接受后才会占用席位。</p><div class="choice-row"><button :class="{ selected: count === 1 }" @click="count = 1">1 个席位</button><button :class="{ selected: count === 2 }" @click="count = 2">2 个席位</button></div><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary-button" :disabled="busy" @click="emit('submit', count)">{{ busy ? '提交中…' : '提交申请' }}</button></section></div></template>
