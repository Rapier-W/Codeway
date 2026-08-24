<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'
const session = useSessionStore(); const name = ref(session.user?.nickname ?? '同路行用户'); const contact = ref(''); const saved = ref(false)
function save() { saved.value = true }
</script>
<template><main class="page"><div class="eyebrow">账户与安全</div><h1>我的</h1><section class="detail-card"><p><strong>{{ name }}</strong></p><p class="muted">手机号仅用于登录验证，不公开展示。</p></section><section class="detail-card"><h2>紧急联系人</h2><label>联系人手机号<input v-model="contact" type="tel" inputmode="tel" placeholder="请输入联系人手机号" /></label><button class="primary-button" @click="save">{{ saved ? '已保存' : '保存联系人' }}</button><p class="muted">SOS 只提供手动拨号引导，不会自动发送消息。</p></section><RouterLink class="secondary-button" to="/sos">打开安全中心</RouterLink></main></template>
