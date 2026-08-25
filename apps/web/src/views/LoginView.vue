<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useSessionStore } from '../stores/session'
const phone = ref(''); const code = ref(''); const countdown = ref(0); const busy = ref(false); let timer: ReturnType<typeof setInterval> | undefined
const route = useRoute(); const router = useRouter(); const session = useSessionStore()
// 联调模式：HTTP 模式下用 dev-login 免验证码直接登录，Task 5 换回短信验证码。
const isHttpMode = import.meta.env.VITE_API_MODE === 'http'
const redirect = computed(() => { const value = typeof route.query.redirect === 'string' ? route.query.redirect : '/trips'; return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/trips' })
async function sendCode() { if (!/^1\d{10}$/.test(phone.value)) return showToast('请输入有效手机号'); await session.requestCode(phone.value); countdown.value = 60; timer = setInterval(() => { countdown.value -= 1; if (!countdown.value && timer) clearInterval(timer) }, 1000) }
async function login() {
  if (!/^1\d{10}$/.test(phone.value)) return showToast('请输入有效手机号')
  busy.value = true
  try {
    if (isHttpMode) await session.devLogin(phone.value)
    else await session.verifyCode(phone.value, code.value)
    await router.replace(redirect.value)
  } catch (error) { showToast(error instanceof Error ? error.message : '登录失败') } finally { busy.value = false }
}
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>
<template><main class="page login-page"><div class="eyebrow">同路行 / 手机验证</div><h1>和熟悉的方向，<br /><em>一起出发。</em></h1><p class="muted">手机号验证后即可发布或加入行程。我们不会公开你的手机号。</p><form @submit.prevent="login"><label>手机号<input v-model="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="请输入手机号" /></label><div v-if="!isHttpMode" class="code-field"><label>短信验证码<input v-model="code" inputmode="numeric" maxlength="6" placeholder="6 位验证码" /></label><button type="button" class="text-button" :disabled="countdown > 0" @click="sendCode">{{ countdown ? `${countdown}s 后重发` : '获取验证码' }}</button></div><button class="primary-button" :disabled="busy">{{ busy ? '验证中…' : '登录 / 注册' }}</button></form><p class="legal">登录即表示你同意用户协议与隐私说明。</p></main></template>
