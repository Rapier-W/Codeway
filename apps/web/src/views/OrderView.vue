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
const reason = ref('')
const busy = ref(false)
const error = ref('')
const client = createApiClient()
const valid = computed(() => mode.value === 'EQUAL' || (amount.value.trim() !== '' && Number.isInteger(Number(amount.value)) && Number(amount.value) > 0))
async function load() { try { order.value = await client.getOrder(String(route.params.id)) } catch { error.value = '订单加载失败，请重试' } }
async function confirm() { busy.value = true; error.value = ''; try { await client.confirmOrder(String(route.params.id)); await load() } catch { error.value = '确认失败，请稍后重试' } finally { busy.value = false } }
async function dispute() { if (!reason.value.trim()) { error.value = '请填写费用异议原因'; return }; busy.value = true; error.value = ''; try { await client.disputeOrder(String(route.params.id), reason.value.trim()); await load() } catch { error.value = '提交异议失败，请稍后重试' } finally { busy.value = false } }
onMounted(load)
</script>
<template><main class="page"><div class="eyebrow">订单与费用</div><h1>费用确认</h1><div v-if="error" class="form-error" role="alert">{{error}}</div><div v-if="order"><OrderConflictBanner :disputed="order.disputed || order.settlementLocked"/><p v-if="order.disputed || order.settlementLocked" class="muted">争议处理中，结算与互评暂时锁定。</p><div class="detail-card"><p>截图仅记录元数据（PNG/JPEG/WebP，≤10MB），不上传原图。</p><label>分摊模式<select v-model="mode" :disabled="order.costShare.confirmed"><option value="EQUAL">等额</option><option value="FIXED">固定金额</option><option value="CUSTOM">自定义</option></select></label><label v-if="mode!=='EQUAL'">金额（分）<input v-model="amount" inputmode="numeric" /></label><button class="primary-button" :disabled="busy || order.disputed || order.settlementLocked || order.costShare.confirmed || !valid" @click="confirm">{{order.costShare.confirmed?'已确认':'确认分摊'}}</button><label v-if="!order.disputed && !order.settlementLocked">费用异议<textarea v-model="reason" rows="2" placeholder="如有异议，请说明原因" /></label><button v-if="!order.disputed && !order.settlementLocked" class="secondary-button" :disabled="busy" @click="dispute">提交费用异议</button><RouterLink v-if="order.status==='PENDING_REVIEW' && !order.disputed && !order.settlementLocked" class="secondary-button" :to="`/orders/${order.id}/review`">去评价同行</RouterLink></div></div><div v-else-if="!error" class="async-state">正在加载订单…</div></main></template>
