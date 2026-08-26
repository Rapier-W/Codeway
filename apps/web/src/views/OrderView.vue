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
const screenshotFile = ref<File | null>(null)
const screenshotState = ref<'idle' | 'selected' | 'uploading' | 'failed' | 'bound'>('idle')
const screenshotError = ref('')
const actualTotalFareCents = ref('')
const viewError = ref('')
const client = createApiClient()
const valid = computed(() => mode.value === 'EQUAL' || (amount.value.trim() !== '' && Number.isInteger(Number(amount.value)) && Number(amount.value) > 0))
const validActualFare = computed(() => actualTotalFareCents.value.trim() !== '' && Number.isInteger(Number(actualTotalFareCents.value)) && Number(actualTotalFareCents.value) >= 0)
async function load() { try { order.value = await client.getOrder(String(route.params.id)) } catch { error.value = '订单加载失败，请重试' } }
async function confirm() { busy.value = true; error.value = ''; try { await client.confirmOrder(String(route.params.id)); await load() } catch { error.value = '确认失败，请稍后重试' } finally { busy.value = false } }
async function dispute() { if (!reason.value.trim()) { error.value = '请填写费用异议原因'; return }; busy.value = true; error.value = ''; try { await client.disputeOrder(String(route.params.id), reason.value.trim()); await load() } catch { error.value = '提交异议失败，请稍后重试' } finally { busy.value = false } }
function selectScreenshot(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  screenshotFile.value = null
  screenshotState.value = 'idle'
  screenshotError.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { screenshotError.value = '仅支持 JPEG、PNG 或 WebP 格式的截图'; return }
  if (file.size > 10 * 1024 * 1024) { screenshotError.value = '截图不能超过 10MB'; return }
  screenshotFile.value = file
  screenshotState.value = 'selected'
}
async function submitFareScreenshot() {
  if (!order.value || !screenshotFile.value || !validActualFare.value || screenshotState.value === 'uploading') return
  screenshotState.value = 'uploading'
  screenshotError.value = ''
  try {
    const intent = await client.createFareScreenshotUpload(order.value.tripId, screenshotFile.value, crypto.randomUUID())
    await client.uploadFareScreenshot(intent, screenshotFile.value)
    await client.createFareOrder(order.value.tripId, intent.uploadId, Number(actualTotalFareCents.value), crypto.randomUUID())
    screenshotState.value = 'bound'
    await load()
  } catch {
    screenshotState.value = 'failed'
    screenshotError.value = '截图上传失败，请重试'
  }
}
async function viewFareScreenshot() {
  viewError.value = ''
  try {
    const screenshot = await client.getFareScreenshotUrl(String(route.params.id))
    window.open(screenshot.url, '_blank', 'noopener,noreferrer')
  } catch {
    viewError.value = '暂时无法打开截图，请稍后重试'
  }
}
onMounted(load)
</script>
<template><main class="page"><div class="eyebrow">订单与费用</div><h1>费用确认</h1><div v-if="error" class="form-error" role="alert">{{error}}</div><div v-if="order"><OrderConflictBanner :disputed="order.disputed || order.settlementLocked"/><p v-if="order.disputed || order.settlementLocked" class="muted">争议处理中，结算与互评暂时锁定。</p><div class="detail-card"><p>上传车费截图（JPEG/PNG/WebP，≤10MB）；仅在你点击查看时获取临时链接。</p><label>车费截图<input type="file" accept="image/jpeg,image/png,image/webp" @change="selectScreenshot" /></label><p v-if="screenshotState==='selected'" class="muted">已选择截图：{{ screenshotFile?.name }}</p><p v-if="screenshotState==='uploading'" class="muted" aria-live="polite">正在上传截图…</p><p v-if="screenshotState==='bound'" class="muted" aria-live="polite">截图已绑定订单</p><div v-if="screenshotError" class="form-error" role="alert">{{ screenshotError }}</div><label>实际总车费（分）<input v-model="actualTotalFareCents" inputmode="numeric" /></label><button data-test="submit-fare-screenshot" class="primary-button screenshot-control" :disabled="busy || screenshotState==='uploading' || !screenshotFile || !validActualFare" @click="submitFareScreenshot">{{ screenshotState==='uploading' ? '正在上传截图…' : '上传截图并提交车费' }}</button><button v-if="screenshotState==='failed'" data-test="retry-fare-screenshot" class="secondary-button screenshot-control" @click="submitFareScreenshot">重新获取上传凭证并重试</button><button data-test="view-fare-screenshot" class="secondary-button screenshot-control" @click="viewFareScreenshot">查看车费截图</button><div v-if="viewError" class="form-error" role="alert">{{ viewError }}</div><label>分摊模式<select v-model="mode" :disabled="order.costShare.confirmed"><option value="EQUAL">等额</option><option value="FIXED">固定金额</option><option value="CUSTOM">自定义</option></select></label><label v-if="mode!=='EQUAL'">金额（分）<input v-model="amount" inputmode="numeric" /></label><button class="primary-button" :disabled="busy || order.disputed || order.settlementLocked || order.costShare.confirmed || !valid" @click="confirm">{{order.costShare.confirmed?'已确认':'确认分摊'}}</button><label v-if="!order.disputed && !order.settlementLocked">费用异议<textarea v-model="reason" rows="2" placeholder="如有异议，请说明原因" /></label><button v-if="!order.disputed && !order.settlementLocked" class="secondary-button" :disabled="busy" @click="dispute">提交费用异议</button><RouterLink v-if="order.status==='PENDING_REVIEW' && !order.disputed && !order.settlementLocked" class="secondary-button" :to="`/orders/${order.id}/review`">去评价同行</RouterLink></div></div><div v-else-if="!error" class="async-state">正在加载订单…</div></main></template>

<style scoped>
input[type='file'], .screenshot-control { min-height: 44px; }
input[type='file'] { display: block; margin-top: 8px; width: 100%; }
</style>
