<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { createApiClient } from '../api/client'
import OrderConflictBanner from '../components/OrderConflictBanner.vue'
import type { Order } from '../api/contracts'
const route = useRoute()
const order = ref<Order | null>(null)
const mode = ref<'EQUAL'|'FIXED'|'CUSTOM'>('EQUAL')
const amount = ref('')
const client = createApiClient()
const valid = computed(() => mode.value === 'EQUAL' || (amount.value.trim() !== '' && Number.isInteger(Number(amount.value)) && Number(amount.value) > 0))
onMounted(async () => { order.value = await client.getOrder(String(route.params.id)) })
</script>
<template><main class="page"><div class="eyebrow">订单与费用</div><h1>费用确认</h1><div v-if="order"><OrderConflictBanner :disputed="order.disputed || order.settlementLocked"/><p v-if="order.disputed || order.settlementLocked" class="muted">争议处理中，结算与互评暂时锁定。</p><div class="detail-card"><p>截图仅记录元数据（PNG/JPEG/WebP，≤10MB），不上传原图。</p><label>分摊模式<select v-model="mode"><option value="EQUAL">等额</option><option value="FIXED">固定金额</option><option value="CUSTOM">自定义</option></select></label><label v-if="mode!=='EQUAL'">金额（分）<input v-model="amount" inputmode="numeric" /></label><button class="primary-button" :disabled="order.disputed || order.settlementLocked || !valid">确认分摊</button></div></div><div v-else class="async-state">正在加载订单…</div></main></template>
