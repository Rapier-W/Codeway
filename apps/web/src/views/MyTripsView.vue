<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { createApiClient } from '../api/client'
import type { MyTripRole, Trip } from '../api/contracts'
import OrderConflictBanner from '../components/OrderConflictBanner.vue'
const role = ref<MyTripRole>('joined'); const trips = ref<Trip[]>([]); const loading = ref(false); const error = ref(''); const client = createApiClient()
async function load() { loading.value = true; error.value = ''; try { trips.value = await client.listMyTrips(role.value) } catch (caught) { error.value = caught instanceof Error ? caught.message : '行程加载失败' } finally { loading.value = false } }
watch(role, load); onMounted(load)
</script>
<template><main class="page"><div class="eyebrow">我的出行</div><h1>行程记录</h1><div class="choice-row"><button class="secondary-button" :class="{selected:role==='joined'}" @click="role='joined'">我加入的</button><button class="secondary-button" :class="{selected:role==='published'}" @click="role='published'">我发布的</button></div><div v-if="loading" class="async-state">正在加载行程…</div><div v-else-if="error" class="async-state state-error" role="alert">{{ error }} <button class="secondary-button" @click="load">重新加载</button></div><div v-else-if="!trips.length" class="async-state">暂无{{ role==='joined'?'加入':'发布' }}的行程。</div><section v-else class="trip-list"><article v-for="trip in trips" :key="trip.id" class="detail-card"><RouterLink :to="`/trips/${trip.id}`"><h2>{{ trip.origin }} → {{ trip.destination }}</h2></RouterLink><p>{{ new Date(trip.departureAt).toLocaleString('zh-CN') }}</p><p class="muted">{{ trip.activeMemberCount }}/{{ trip.capacity }} 人 · {{ trip.status }}</p><OrderConflictBanner :disputed="Boolean(trip.disputeLocked)" /><RouterLink v-if="trip.fareOrderId" class="secondary-button" :to="`/orders/${trip.fareOrderId}`">查看订单</RouterLink></article></section></main></template>
