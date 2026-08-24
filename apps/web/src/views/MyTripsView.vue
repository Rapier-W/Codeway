<script setup lang="ts">
import { ref } from 'vue'
import OrderConflictBanner from '../components/OrderConflictBanner.vue'
const tab = ref<'published'|'joined'>('joined')
const trips = [{ id:'trip-1', route:'大学城南门 → 火车站', status:'CONFIRMING', disputed:false }, { id:'trip-2', route:'科技园 → 市民中心', status:'FORMED', disputed:true }]
</script>
<template><main class="page"><div class="eyebrow">我的出行</div><h1>行程记录</h1><div class="choice-row"><button class="secondary-button" :class="{selected:tab==='joined'}" @click="tab='joined'">我加入的</button><button class="secondary-button" :class="{selected:tab==='published'}" @click="tab='published'">我发布的</button></div><article v-for="t in trips" :key="t.id" class="detail-card"><h2>{{t.route}}</h2><p class="muted">{{t.status==='CONFIRMING'?'等待全员确认':'已成团'}}</p><OrderConflictBanner :disputed="t.disputed"/></article></main></template>
