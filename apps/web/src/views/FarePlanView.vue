<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { createApiClient } from '../api/client'
import { createIdempotencyKey } from '../api/idempotency'
import { ApiError, type FareChangeRequest, type FarePlan, type FarePlanInput, type Trip } from '../api/contracts'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const client = createApiClient()

const trip = ref<Trip | null>(null)
const plan = ref<FarePlan | null>(null)
const current = ref<FareChangeRequest | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)

const mode = ref<'EQUAL' | 'FIXED' | 'CUSTOM'>('EQUAL')
const amount = ref('')
const allocInputs = ref<Record<string, string>>({})
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

const isCreator = computed(() => Boolean(session.user && trip.value?.creatorId === session.user.id))
const alreadyDecided = computed(() => Boolean(current.value && session.user && current.value.decisions.some((d) => d.userId === session.user!.id)))
const myDecision = computed(() => current.value?.decisions.find((d) => d.userId === session.user?.id)?.decision)
const canVote = computed(() => current.value?.status === 'PENDING' && !isCreator.value && Boolean(session.user) && !alreadyDecided.value)
const canPropose = computed(() => isCreator.value && (!current.value || current.value.status !== 'PENDING') && (trip.value?.members?.length ?? 0) >= 2)

const allocTotal = computed(() => {
  let sum = 0
  for (const userId of Object.keys(allocInputs.value)) sum += Number(allocInputs.value[userId] || 0)
  return sum
})
const canSubmit = computed(() => {
  if (mode.value === 'EQUAL') return true
  if (mode.value === 'FIXED') return amount.value.trim() !== '' && Number.isInteger(Number(amount.value)) && Number(amount.value) >= 0
  if (mode.value === 'CUSTOM') return allocTotal.value === 100 && (trip.value?.members?.length ?? 0) > 0
  return false
})

const memberLabel = (userId: string) => trip.value?.members?.find((m) => m.userId === userId)?.nickname || userId.slice(0, 8)

const planSummary = computed(() => summarizePlan(plan.value?.feePlan))
const revisionSummary = (rev: FareChangeRequest['revision'] | null) => (rev ? summarizePlan({ mode: rev.mode, allocations: rev.allocations, amountCents: rev.amountCents }) : '—')

const decisionView = computed(() => {
  if (!current.value) return []
  const decided = new Map(current.value.decisions.map((d) => [d.userId, d.decision]))
  const rows: Array<{ userId: string; label: string; text: string }> = []
  for (const [userId, decision] of decided) rows.push({ userId, label: memberLabel(userId), text: decision === 'APPROVED' ? '同意' : '拒绝' })
  // 尚未表决的成员
  for (const m of trip.value?.members ?? []) {
    if (!decided.has(m.userId)) rows.push({ userId: m.userId, label: memberLabel(m.userId), text: '待表决' })
  }
  return rows
})

function summarizePlan(p?: { mode: 'EQUAL' | 'FIXED' | 'CUSTOM'; allocations?: Record<string, number> | null; amountCents?: number | null }): string {
  if (!p) return '—'
  if (p.mode === 'EQUAL') return '均摊'
  if (p.mode === 'FIXED') return `固定总额 ¥${((p.amountCents ?? 0) / 100).toFixed(2)}`
  const parts = Object.entries(p.allocations ?? {}).map(([userId, pct]) => `${memberLabel(userId)} ${pct}%`)
  return `自定义比例（${parts.join('、') || '未设置'}）`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN')
}
function remainingHours(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.value) / (3600 * 1000)))
}

const requestStatusLabel = computed(() => {
  switch (current.value?.status) {
    case 'PENDING': return '进行中'
    case 'APPROVED': return '已通过'
    case 'REJECTED': return '已拒绝'
    case 'EXPIRED': return '已过期'
    default: return '—'
  }
})

async function load() {
  loading.value = true
  error.value = ''
  const tripId = String(route.params.id)
  try {
    const [tripRes, planRes, currentRes] = await Promise.all([
      client.getTrip(tripId),
      client.getFarePlan(tripId),
      client.getCurrentFareChangeRequest(tripId),
    ])
    trip.value = tripRes
    plan.value = planRes
    current.value = currentRes.changeRequest
    if (mode.value === 'CUSTOM' && tripRes.members) {
      const next: Record<string, string> = {}
      for (const m of tripRes.members) if (!(m.userId in allocInputs.value)) next[m.userId] = '0'
      allocInputs.value = { ...allocInputs.value, ...next }
    }
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function submitChange() {
  if (!trip.value || !canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  const input: FarePlanInput = { mode: mode.value }
  if (mode.value === 'FIXED') input.amountCents = Number(amount.value)
  if (mode.value === 'CUSTOM') {
    const allocations: Record<string, number> = {}
    for (const m of trip.value.members ?? []) allocations[m.userId] = Number(allocInputs.value[m.userId] || 0)
    input.allocations = allocations
  }
  try {
    await client.createFareChangeRequest(trip.value.id, input, createIdempotencyKey())
    showToast('变更申请已提交，等待成员表决')
    mode.value = 'EQUAL'
    amount.value = ''
    await load()
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : '提交失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

async function vote(decision: 'APPROVED' | 'REJECTED') {
  if (!trip.value || !current.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await client.decideFareChangeRequest(trip.value.id, current.value.id, decision, createIdempotencyKey())
    await load()
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : '表决失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

onMounted(() => { load(); timer = setInterval(() => { now.value = Date.now() }, 30 * 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="page">
    <div v-if="loading" class="async-state">正在加载费用方案…</div>
    <div v-else-if="error" class="async-state state-error" role="alert"><p>{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div>
    <template v-else-if="trip && plan">
      <div class="eyebrow">费用方案</div>
      <h1>费用方案</h1>

      <div class="detail-card">
        <p class="muted"><strong>当前生效方案</strong></p>
        <p>{{ planSummary }}</p>
      </div>

      <div v-if="current" class="detail-card">
        <p class="muted"><strong>费用变更申请（{{ requestStatusLabel }}）</strong></p>
        <p>拟变更为新方案：{{ revisionSummary(current.revision) }}</p>
        <p v-if="current.status === 'PENDING'" aria-live="polite">表决截止：{{ formatDate(current.expiresAt) }}（剩余约 {{ remainingHours(current.expiresAt) }} 小时）</p>
        <ul class="decision-list">
          <li v-for="d in decisionView" :key="d.userId"><span>{{ d.label }}</span><span :class="{ 'text-warn': d.text === '拒绝', 'text-ok': d.text === '同意' }">{{ d.text }}</span></li>
        </ul>
        <div v-if="canVote" class="choice-row">
          <button class="primary-button" :disabled="busy" @click="vote('APPROVED')">同意</button>
          <button class="secondary-button" :disabled="busy" @click="vote('REJECTED')">拒绝</button>
        </div>
        <p v-else-if="isCreator && current.status === 'PENDING'" class="muted">你是发单人，等待成员表决。</p>
        <p v-else-if="alreadyDecided" class="muted">你已表决：{{ myDecision === 'APPROVED' ? '同意' : '拒绝' }}。</p>
        <p v-if="current.status === 'APPROVED'" class="muted">变更已通过，新方案已生效；旧确认已作废，需全员重新确认锁定。</p>
        <p v-else-if="current.status === 'REJECTED'" class="muted">变更被拒绝，原方案保持不变。</p>
        <p v-else-if="current.status === 'EXPIRED'" class="muted">变更申请已过期，原方案保持不变。</p>
      </div>

      <div v-if="canPropose" class="detail-card">
        <p class="muted"><strong>发起费用变更</strong></p>
        <label>分摊模式
          <select v-model="mode">
            <option value="EQUAL">均摊</option>
            <option value="FIXED">固定总额</option>
            <option value="CUSTOM">自定义比例</option>
          </select>
        </label>
        <label v-if="mode === 'FIXED'">总金额（分）<input v-model="amount" inputmode="numeric" /></label>
        <div v-if="mode === 'CUSTOM'">
          <p class="muted">为每个成员设置分摊比例（合计需为 100）：</p>
          <label v-for="m in (trip.members ?? [])" :key="m.userId">{{ memberLabel(m.userId) }}
            <input v-model="allocInputs[m.userId]" inputmode="numeric" />
          </label>
          <p v-if="allocTotal !== 100" class="form-error" role="alert">比例合计需为 100，当前 {{ allocTotal }}。</p>
        </div>
        <button class="primary-button" :disabled="busy || !canSubmit" @click="submitChange">提交变更申请</button>
      </div>
      <p v-else-if="!isCreator" class="muted">仅发单人可发起费用变更。</p>

      <div v-if="error" class="form-error" role="alert">{{ error }}</div>
      <RouterLink class="secondary-button" :to="`/trips/${trip.id}`">返回行程</RouterLink>
    </template>
  </main>
</template>

<style scoped>
.decision-list { list-style: none; padding: 0; margin: 8px 0; }
.decision-list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
.text-ok { color: #07c160; font-weight: 600; }
.text-warn { color: #ee0a24; font-weight: 600; }
input[type='number'], input[inputmode='numeric'], select { min-height: 40px; width: 100%; margin-top: 4px; }
label { display: block; margin: 10px 0; }
</style>
