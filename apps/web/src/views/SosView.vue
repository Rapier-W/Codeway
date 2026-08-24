<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { createApiClient } from '../api/client'
import { createIdempotencyKey } from '../api/idempotency'
const api = createApiClient(); const note = ref(''); const status = ref(''); const holding = ref(false); let timer: ReturnType<typeof setTimeout> | undefined
function start() { holding.value = true; timer = setTimeout(async () => { try { await api.createSosEvent({ note: note.value || undefined }, createIdempotencyKey()); status.value = '已记录安全事件，请按需手动联系紧急联系人或 110。' } catch { status.value = '记录失败，请立即手动拨打 110。' } finally { holding.value = false } }, 1200) }
function cancel() { if (timer) clearTimeout(timer); timer = undefined; holding.value = false }
onBeforeUnmount(cancel)
</script>
<template><main class="page"><div class="eyebrow">安全中心</div><h1>需要帮助？</h1><p class="muted">长按 1.2 秒记录安全事件。此功能不会自动发送短信或报警。</p><button class="sos-button" :class="{ holding }" @pointerdown="start" @pointerup="cancel" @pointerleave="cancel" @pointercancel="cancel">{{ holding ? '继续按住…' : '长按记录 SOS' }}</button><label>备注（可选）<textarea v-model="note" maxlength="120" placeholder="例如：需要同伴确认安全"></textarea></label><p v-if="status" class="detail-card" role="status">{{ status }}</p><section class="detail-card"><h2>手动求助</h2><a class="secondary-button" href="tel:110">拨打 110</a><p class="muted">紧急联系人请在“我的”页面查看并手动拨号。</p></section></main></template>
