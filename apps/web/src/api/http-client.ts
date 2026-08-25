import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip, type ChatMessage, type Order, type ReviewInput } from './contracts'
import { resolveErrorMessage } from './error-messages'

export class HttpApiClient implements ApiClient {
  // 开发联调占位：当前用户 id，登录成功后写入，作为 x-user-id 头带给后端。Task 5 换成 Cookie 会话后删除。
  static currentUserId: string | null = null

  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}
  requestCode(phone: string, idempotencyKey: string) { return this.write<void>('/auth/request-code', { phone }, idempotencyKey) }
  async verifyCode(phone: string, code: string, idempotencyKey: string) {
    const user = await this.write<SessionUser>('/auth/verify-code', { phone, code }, idempotencyKey)
    HttpApiClient.currentUserId = user.id
    return user
  }
  // 开发联调占位：直接换取 userId 完成登录，无需验证码。
  async devLogin(phone: string): Promise<SessionUser> {
    const user = await this.write<SessionUser>('/auth/dev-login', { phone }, crypto.randomUUID())
    HttpApiClient.currentUserId = user.id
    return user
  }
  async listTrips() { return (await this.request<unknown[]>('/trips')).map(normalizeTrip) }
  async getTrip(tripId: string) { return normalizeTrip(await this.request<unknown>(`/trips/${tripId}`)) }
  async createTrip(input: CreateTripInput, idempotencyKey: string) {
    // 后端 DTO 收 departTime，前端统一用 departureAt，这里做一次映射。
    const { departureAt, ...rest } = input
    return normalizeTrip(await this.write<unknown>('/trips', { ...rest, departTime: departureAt }, idempotencyKey))
  }
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string) { return this.write<JoinRequest>(`/trips/${tripId}/join`, input, idempotencyKey) }
  confirmTrip(tripId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirmations`, {}, idempotencyKey) }
  withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirmations/${confirmationId}/withdraw`, {}, idempotencyKey) }
  createSosEvent(input: SosInput, idempotencyKey: string) { return this.write<{ id: string; createdAt: string }>('/sos-events', input, idempotencyKey) }
  listMessages(tripId: string) { return this.request<ChatMessage[]>(`/trips/${encodeURIComponent(tripId)}/messages`) }
  sendMessage(tripId: string, text: string, idempotencyKey: string) { return this.write<ChatMessage>(`/trips/${encodeURIComponent(tripId)}/messages`, { text }, idempotencyKey) }
  getOrder(orderId: string) { return this.request<Order>(`/orders/${encodeURIComponent(orderId)}`) }
  async submitReview(input: ReviewInput, idempotencyKey: string) { await this.write<void>('/reviews', input, idempotencyKey) }

  private authHeaders(): Record<string, string> {
    // 开发联调占位：登录后把当前用户 id 带给后端，Task 5 换 Cookie 会话后删除。
    return HttpApiClient.currentUserId ? { 'x-user-id': HttpApiClient.currentUserId } : {}
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { ...this.authHeaders(), ...(init.headers as Record<string, string> | undefined) } })
    } catch {
      // fetch 只在网络层失败时抛异常，这里转成统一的 ApiError 而不是让调用方看到原始 TypeError。
      throw new ApiError('NETWORK_ERROR', resolveErrorMessage('NETWORK_ERROR'), 0)
    }

    if (!response.ok) {
      // 后端统一返回 { code, message, statusCode }；code 是业务错误码，需翻译成可读文案。
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string }
      const code = body.code ?? (response.status === 409 ? 'STATE_CONFLICT' : 'REQUEST_FAILED')
      throw new ApiError(code, resolveErrorMessage(code, body.message), response.status)
    }

    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }

  private write<T>(path: string, body: unknown, idempotencyKey: string) {
    return this.request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) })
  }
}

function normalizeTrip(value: unknown): Trip {
  const raw = value as Record<string, unknown>
  const reasons = Array.isArray(raw.recommendationReasons) ? raw.recommendationReasons : Array.isArray(raw.reasonCodes) ? raw.reasonCodes : []
  const reasonMap: Record<string, Trip['recommendationReasons'][number]> = { OPEN_SLOT: 'AVAILABLE', TIME_CLOSE: 'TIME_CLOSE', RELIABLE: 'RELIABLE', VERIFIED: 'VERIFIED', AVAILABLE: 'AVAILABLE' }
  return { ...raw, departureAt: String(raw.departureAt ?? raw.departTime ?? ''), activeMemberCount: Number(raw.activeMemberCount ?? raw.memberCount ?? 0), recommendationReasons: reasons.map((reason) => reasonMap[String(reason)]).filter(Boolean) } as Trip
}
