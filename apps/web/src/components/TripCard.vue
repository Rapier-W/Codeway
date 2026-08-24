<script setup lang="ts">
import type { Trip } from '../api/contracts'
import { computed } from 'vue'
const props = defineProps<{ trip: Trip }>()
const emit = defineEmits<{ open: [id: string] }>()
const labels: Record<string, string> = { TIME_CLOSE: '时间相近', RELIABLE: '履约较好', VERIFIED: '已验证', AVAILABLE: '空位充足' }
const reasons = computed(() => props.trip.recommendationReasons.map((r) => labels[r]).filter(Boolean).slice(0, 3))
const time = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(props.trip.departureAt)))
</script>
<template>
  <article class="trip-card" tabindex="0" @click="emit('open', trip.id)" @keydown.enter="emit('open', trip.id)">
    <div class="trip-card__time">{{ time }}</div>
    <div class="trip-card__route"><strong>{{ trip.origin }}</strong><span aria-hidden="true">→</span><strong>{{ trip.destination }}</strong></div>
    <div class="trip-card__meta"><span>{{ trip.activeMemberCount }}/{{ trip.capacity }} 人</span><span v-if="reasons.length" class="reasons">{{ reasons.join(' · ') }}</span></div>
  </article>
</template>
