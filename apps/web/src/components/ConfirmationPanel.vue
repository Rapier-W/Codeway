<script setup lang="ts">
defineProps<{ status: 'RECRUITING'|'CONFIRMING'|'FORMED'; confirmedCount: number; total: number; retractUntil?: string }>()
const emit = defineEmits<{ confirm: []; withdraw: [] }>()
</script>
<template>
  <section class="detail-card confirmation-panel" aria-live="polite">
    <div v-if="status === 'RECRUITING'">等待发单人接受成员，满员后开始确认</div>
    <div v-else-if="status === 'CONFIRMING'">
      <strong>全员确认 {{ confirmedCount }}/{{ total }}</strong><p class="muted">请确认你会按时同行，所有成员确认后成团。</p>
      <button class="primary-button" @click="emit('confirm')">确认同行</button>
    </div>
    <div v-else><strong>已成团</strong><p class="muted">15 秒内可反悔，之后将锁定行程。</p><button class="secondary-button" @click="emit('withdraw')">撤回确认</button></div>
  </section>
</template>
