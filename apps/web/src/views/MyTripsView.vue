<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import OrderConflictBanner from '../components/OrderConflictBanner.vue'
import { createApiClient } from '../api/client'
import type { Trip } from '../api/contracts'
const tab = ref<'published' | 'joined'>('joined'); const trips = ref<Trip[]>([]); const loading = ref(true); const error = ref(''); const client = createApiClient()
async function load() { loading.value = true; error.value = ''; try { trips.value = await client.listMyTrips(tab.value) } catch (caught) { error.value = caught instanceof Error ? caught.message : '加载失败' } finally { loading.value = false } }
watch(tab, load); onMounted(load)
</script>
<template><main class="page"><div class="eyebrow">我的出行</div><h1>行程记录</h1><div class="choice-row"><button class="secondary-button" :class="{selected:tab==='joined'}" @click="tab='joined'">我加入的</button><button class="secondary-button" :class="{selected:tab==='published'}" @click="tab='published'">我发布的</button></div><div v-if="loading" class="async-state">正在加载行程…</div><div v-else-if="error" class="async-state state-error" role="alert">{{ error }} <button class="secondary-button" @click="load">重新加载</button></div><div v-else-if="!trips.length" class="async-state">暂无相关行程</div><template v-else><article v-for="t in trips" :key="t.id" class="detail-card"><h2>{{t.origin}} → {{t.destination}}</h2><p class="muted">{{t.status === 'CONFIRMING' ? '等待全员确认' : t.status === 'FORMED' ? '已成团' : t.status}}</p><p>同行人数：{{t.activeMemberCount}}/{{t.capacity}}</p><OrderConflictBanner :disputed="false" /><RouterLink class="secondary-button" :to="`/trips/${t.id}`">查看详情</RouterLink></article></template></main></template>
