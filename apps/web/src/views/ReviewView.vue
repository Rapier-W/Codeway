<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { showToast } from 'vant'
import { createApiClient } from '../api/client'
import { createIdempotencyKey } from '../api/idempotency'
import { useSessionStore } from '../stores/session'
import type { TripMember } from '../api/contracts'

const route = useRoute()
const session = useSessionStore()
const api = createApiClient()
const scores = ref([0, 0, 0, 0])
const targetUserId = ref(String(route.query.targetUserId ?? ''))
const targets = ref<TripMember[]>([])
const comment = ref('')
const anonymous = ref(false)
const submitting = ref(false)
const loading = ref(true)
const error = ref('')
const labels = ['守时', '沟通', '安全', '礼貌']

async function load() {
  try {
    const order = await api.getOrder(String(route.params.id))
    const trip = await api.getTrip(order.tripId)
    targets.value = (trip.members ?? []).filter((member) => member.userId !== session.user?.id)
    if (!targetUserId.value && targets.value.length === 1) targetUserId.value = targets.value[0].userId
  } catch { error.value = '同行信息加载失败，请重试' }
  finally { loading.value = false }
}

async function submit() {
  if (!targetUserId.value) { error.value = '请选择被评价同行'; return }
  if (scores.value.some((score) => score < 1)) { error.value = '请完成全部评价后再提交'; return }
  submitting.value = true; error.value = ''
  try {
    await api.submitReview({ fareOrderId: String(route.params.id), targetUserId: targetUserId.value, dimensions: { punctuality: scores.value[0], communication: scores.value[1], safety: scores.value[2], fairness: scores.value[3] }, comment: comment.value, anonymous: anonymous.value }, createIdempotencyKey())
    showToast('评价已提交')
  } catch { error.value = '提交失败，请稍后重试' }
  finally { submitting.value = false }
}
onMounted(load)
</script>
<template><main class="page"><div class="eyebrow">同行反馈</div><h1>评价</h1><div v-if="loading" class="async-state">正在加载同行信息…</div><div v-else class="detail-card"><label>被评价同行<select v-model="targetUserId"><option value="">请选择同行</option><option v-for="target in targets" :key="target.userId" :value="target.userId">{{target.nickname||target.userId}}</option></select></label><label v-for="(l,i) in labels" :key="l">{{l}}<input v-model.number="scores[i]" type="number" min="1" max="5" /></label><label>补充说明<textarea v-model="comment" rows="3"></textarea></label><label><input v-model="anonymous" type="checkbox" /> 匿名评价</label><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary-button" :disabled="submitting" @click="submit">{{ submitting?'提交中…':'提交评价' }}</button></div></main></template>
