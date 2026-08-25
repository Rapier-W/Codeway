import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip, type ChatMessage, type Order, type ReviewInput, type MyTripRole, type MessagePage, type Vehicle, type RideLaunch, type EmergencyContact } from './contracts'
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
  async listMyTrips(role: MyTripRole) { return (await this.request<unknown[]>(`/trips/mine?role=${role}`)).map(normalizeTrip) }
  async getTrip(tripId: string) { return normalizeTrip(await this.request<unknown>(`/trips/${tripId}`)) }
  async createTrip(input: CreateTripInput, idempotencyKey: string) {
    // 后端 DTO 收 departTime，前端统一用 departureAt，这里做一次映射。
    const { departureAt, ...rest } = input
    return normalizeTrip(await this.write<unknown>('/trips', { ...rest, departTime: departureAt }, idempotencyKey))
  }
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string) { return this.write<JoinRequest>(`/trips/${tripId}/join`, input, idempotencyKey) }
  async confirmTrip(tripId: string, idempotencyKey: string) { return normalizeTripState(await this.write<any>(`/trips/${tripId}/confirmations`, {}, idempotencyKey)) }
  async withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string) { return normalizeTripState(await this.write<any>(`/trips/${tripId}/confirmations/${confirmationId}/withdraw`, {}, idempotencyKey)) }
  confirmFareOrder(orderId: string, idempotencyKey: string) { return this.write(`/fare-orders/${encodeURIComponent(orderId)}/confirm`, {}, idempotencyKey) }
  disputeFareOrder(orderId: string, reason: string, idempotencyKey: string) { return this.write(`/fare-orders/${encodeURIComponent(orderId)}/dispute`, { reason }, idempotencyKey) }
  markPayment(orderId: string, amountCents: number | undefined, idempotencyKey: string) { return this.write(`/fare-orders/${encodeURIComponent(orderId)}/payment-mark`, amountCents === undefined ? {} : { amountCents }, idempotencyKey) }
  updateVehicle(tripId: string, vehicle: Vehicle, idempotencyKey: string) { return this.write<Vehicle>(`/trips/${encodeURIComponent(tripId)}/vehicle`, vehicle, idempotencyKey) }
  openRide(tripId: string, platform: string, idempotencyKey: string) { return this.write<RideLaunch>(`/trips/${encodeURIComponent(tripId)}/ride/open`, { platform }, idempotencyKey) }
  // 后端 SOS 挂在行程下：POST /trips/:id/sos。tripId 缺失时无法上报，抛出可读错误而不是打 404。
  async createSosEvent(input: SosInput, idempotencyKey: string) {
    if (!input.tripId) throw new ApiError('SOS_TRIP_REQUIRED', resolveErrorMessage('SOS_TRIP_REQUIRED'), 400)
    const { tripId, ...rest } = input
    return this.write<{ id: string; createdAt: string }>(`/trips/${encodeURIComponent(tripId)}/sos`, rest, idempotencyKey)
  }
  // 后端返回 { messages, hasMore, nextCursor } 游标分页结构，这里取 messages 以符合前端契约。
  async listMessages(tripId: string) {
    return (await this.listMessagesPage(tripId)).messages
  }
  listMessagesPage(tripId: string, options: { before?: string; limit?: number } = {}): Promise<MessagePage> {
    const params = new URLSearchParams()
    if (options.before) params.set('before', options.before)
    if (options.limit) params.set('limit', String(options.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return this.request<MessagePage>(`/trips/${encodeURIComponent(tripId)}/messages${suffix}`)
  }

  // 后端在响应里附带 duplicate 标记（幂等命中），前端不需要它。
  async sendMessage(tripId: string, text: string, idempotencyKey: string) {
    const { duplicate: _duplicate, ...message } = await this.write<ChatMessage & { duplicate?: boolean }>(`/trips/${encodeURIComponent(tripId)}/messages`, { text }, idempotencyKey)
    return message as ChatMessage
  }
  // 后端订单路径是 /fare-orders/:id。
  getOrder(orderId: string) { return this.request<Order>(`/fare-orders/${encodeURIComponent(orderId)}`) }

  // 评价以真实 fareOrderId 发起，后端会由订单反查行程并校验双方成员关系。
  async submitReview(input: ReviewInput, idempotencyKey: string) {
    const { fareOrderId, dimensions, ...rest } = input
    await this.write<void>(`/fare-orders/${encodeURIComponent(fareOrderId)}/review`, {
      ...rest,
      punctuality: dimensions.punctuality,
      communication: dimensions.communication,
      safety: dimensions.safety,
      politeness: dimensions.fairness,
    }, idempotencyKey)
  }
  addEmergencyContact(input: { name: string; phone: string }, idempotencyKey: string) { return this.write<EmergencyContact>('/emergency-contacts', input, idempotencyKey) }

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

function normalizeTripState(value: any): Trip {
  const trip = value.trip ?? value
  return normalizeTrip({ ...trip, status: value.tripStatus ?? trip.status, confirmationId: value.confirmation?.id, retractUntil: value.retractUntil ?? value.confirmation?.retractUntil, confirmedCount: value.confirmedCount ?? value.confirmationCount })
}

function normalizeTrip(value: unknown): Trip {
  const raw = value as Record<string, unknown>
  const reasons = Array.isArray(raw.recommendationReasons) ? raw.recommendationReasons : Array.isArray(raw.reasonCodes) ? raw.reasonCodes : []
  const reasonMap: Record<string, Trip['recommendationReasons'][number]> = { OPEN_SLOT: 'AVAILABLE', TIME_CLOSE: 'TIME_CLOSE', RELIABLE: 'RELIABLE', VERIFIED: 'VERIFIED', AVAILABLE: 'AVAILABLE' }
  const fareOrders = Array.isArray(raw.fareOrders) ? raw.fareOrders as Array<Record<string, unknown>> : []
  const members = Array.isArray(raw.members) ? raw.members as Array<Record<string, unknown>> : []
  const activeMemberCount = raw.activeMemberCount !== undefined ? Number(raw.activeMemberCount) : members.reduce((total, member) => total + Number(member.memberCount ?? 0), Number(raw.memberCount ?? 0))
  return { ...raw, departureAt: String(raw.departureAt ?? raw.departTime ?? ''), activeMemberCount, fareOrderId: raw.fareOrderId ?? fareOrders[0]?.id, recommendationReasons: reasons.map((reason) => reasonMap[String(reason)]).filter(Boolean) } as Trip
}
