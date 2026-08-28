<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripsStore } from '../stores/trips'
import TripCard from '../components/TripCard.vue'; import FilterSheet from '../components/FilterSheet.vue'; import AsyncState from '../components/AsyncState.vue'
const store = useTripsStore(); const router = useRouter(); const showFilter = ref(false); const filters = ref({ origin: '', destination: '' }); const sort = ref<'time' | 'spaces'>('time')
onMounted(() => store.load())
const items = computed(() => store.items.filter((t) => (!filters.value.origin || t.origin.includes(filters.value.origin)) && (!filters.value.destination || t.destination.includes(filters.value.destination))).sort((a,b) => sort.value === 'time' ? a.departureAt.localeCompare(b.departureAt) : (b.capacity-b.activeMemberCount)-(a.capacity-a.activeMemberCount)))
</script>
<template><main class="page"><div class="page-heading"><div><div class="eyebrow">今天想去哪里</div><h1>发现同行</h1></div><RouterLink class="icon-action" to="/trips/create" aria-label="发布行程">＋</RouterLink></div><div class="toolbar"><button class="secondary-button" @click="showFilter = true">筛选</button><select v-model="sort" aria-label="排序"><option value="time">出发时间</option><option value="spaces">空位优先</option></select></div><RouterLink class="muted disclaimer-link" to="/disclaimer">推荐结果仅供参考，查看推荐说明</RouterLink><AsyncState :loading="store.loading" :error="store.error" :empty="!store.loading && !store.error && items.length === 0" @retry="store.load()" /><section v-if="!store.loading && !store.error && items.length" class="trip-list"><TripCard v-for="trip in items" :key="trip.id" :trip="trip" @open="router.push(`/trips/${$event}`)" /></section><FilterSheet v-if="showFilter" v-model="filters" @close="showFilter = false" /></main></template>
