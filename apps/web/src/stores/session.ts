import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiClient, SessionUser } from '../api/contracts'
import { createIdempotencyKey } from '../api/idempotency'
import { createApiClient } from '../api/client'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const loading = ref(false)
  async function requestCode(phone: string, client: ApiClient = createApiClient()) { await client.requestCode(phone, createIdempotencyKey()) }
  async function verifyCode(phone: string, code: string, client: ApiClient = createApiClient()) { loading.value = true; try { user.value = await client.verifyCode(phone, code, createIdempotencyKey()) } finally { loading.value = false } }
  // 开发联调占位：Task 3 用 dev-login 直接登录，跳过短信验证码。Task 5 移除。
  async function devLogin(phone: string, client: ApiClient = createApiClient()) { loading.value = true; try { user.value = await client.devLogin(phone) } finally { loading.value = false } }
  return { user, loading, requestCode, verifyCode, devLogin }
})
