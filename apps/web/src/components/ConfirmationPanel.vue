<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
const props = defineProps<{ status: 'RECRUITING'|'CONFIRMING'|'FORMED'; confirmedCount: number; total: number; retractUntil?: string }>()
const emit = defineEmits<{ confirm: []; withdraw: [] }>()
const remainingMs = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const update = () => { remainingMs.value = props.retractUntil ? Math.max(0, new Date(props.retractUntil).getTime() - Date.now()) : 0 }
if (props.status === 'FORMED' && props.retractUntil) { update(); timer = setInterval(update, 250) }
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
const canWithdraw = computed(() => props.status === 'FORMED' && (!props.retractUntil || remainingMs.value > 0))
</script>
<template>
  <section class="detail-card confirmation-panel" aria-live="polite">
    <div v-if="status === 'RECRUITING'">等待发单人接受成员，满员后开始确认</div>
    <div v-else-if="status === 'CONFIRMING'">
      <strong>全员确认 {{ confirmedCount }}/{{ total }}</strong><p class="muted">请确认你会按时同行，所有成员确认后成团。</p>
      <button class="primary-button" @click="emit('confirm')">确认同行</button>
    </div>
    <div v-else><strong>已成团</strong><p class="muted">{{ canWithdraw ? `15 秒内可反悔（剩余 ${Math.ceil(remainingMs / 1000)} 秒）` : '反悔窗口已结束，行程已锁定。' }}</p><button class="secondary-button" :disabled="!canWithdraw" @click="emit('withdraw')">撤回确认</button></div>
  </section>
</template>
