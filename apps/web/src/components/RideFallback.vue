<script setup lang="ts">
import { showToast } from 'vant'
const props = defineProps<{ phone?: string; text: string }>()
async function copy() { try { await navigator.clipboard?.writeText(props.text); showToast('行程信息已复制') } catch { showToast('请手动复制行程信息') } }
</script>
<template><section class="detail-card"><h2>叫车协助</h2><p class="muted">当前仅提供第三方平台手动打开指引，不获取实时位置。</p><div class="toolbar"><a v-if="props.phone" class="primary-button" :href="`tel:${props.phone}`">手动联系</a><button class="secondary-button" @click="copy">复制行程</button></div></section></template>
