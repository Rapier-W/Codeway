import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip, type ChatMessage, type Order, type ReviewInput } from './contracts'

export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}
  requestCode(phone: string, idempotencyKey: string) { return this.write<void>('/auth/request-code', { phone }, idempotencyKey) }
  async verifyCode(phone: string, code: string, idempotencyKey: string) {
    const user = await this.write<SessionUser>('/auth/verify-code', { phone, code }, idempotencyKey)
    if (typeof localStorage !== 'undefined') localStorage.setItem('tongluxing-dev-user-id', user.id)
    return user
  }
  async listTrips() { return (await this.request<unknown[]>('/trips')).map(normalizeTrip) }
  async getTrip(tripId: string) { return normalizeTrip(await this.request<unknown>(`/trips/${tripId}`)) }
  async createTrip(input: CreateTripInput, idempotencyKey: string) { return normalizeTrip(await this.write<unknown>('/trips', { ...input, departTime: input.departureAt }, idempotencyKey)) }
  async joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string) { const result = await this.write<any>(`/trips/${tripId}/join`, input, idempotencyKey); return { id: result.id ?? result.member?.id, tripId, memberCount: result.memberCount ?? result.member?.memberCount, status: result.status ?? 'PENDING' } }
  async confirmTrip(tripId: string, idempotencyKey: string) { return normalizeTripState(await this.write<any>(`/trips/${tripId}/confirmations`, {}, idempotencyKey)) }
  async withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string) { return normalizeTripState(await this.write<any>(`/trips/${tripId}/confirmations/${confirmationId}/withdraw`, {}, idempotencyKey)) }
  createSosEvent(input: SosInput, idempotencyKey: string) { if (!input.tripId) return Promise.reject(new ApiError('TRIP_REQUIRED', '需要关联行程', 400)); return this.write<{ id: string; createdAt: string }>(`/trips/${encodeURIComponent(input.tripId)}/sos`, { note: input.note }, idempotencyKey) }
  listMessages(tripId: string) { return this.request<ChatMessage[]>(`/trips/${encodeURIComponent(tripId)}/messages`) }
  sendMessage(tripId: string, text: string, idempotencyKey: string) { return this.write<ChatMessage>(`/trips/${encodeURIComponent(tripId)}/messages`, { text }, idempotencyKey) }
  getOrder(orderId: string) { return this.request<Order>(`/orders/${encodeURIComponent(orderId)}`) }
  async submitReview(input: ReviewInput, idempotencyKey: string) { await this.write<void>('/reviews', input, idempotencyKey) }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => { headers[key] = value })
    const devUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('tongluxing-dev-user-id') : null
    if (devUserId) headers['x-user-id'] = devUserId
    const response = await fetch(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string | string[] }
      const message = Array.isArray(body.message) ? body.message.join('；') : body.message
      const code = body.code ?? (typeof message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(message) ? message : undefined) ?? (response.status === 409 ? 'STATE_CONFLICT' : 'REQUEST_FAILED')
      throw new ApiError(code, message ?? '请求失败，请稍后再试', response.status)
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
  const members = Array.isArray(raw.members) ? raw.members as Array<Record<string, unknown>> : []
  return { ...raw, departureAt: String(raw.departureAt ?? raw.departTime ?? ''), activeMemberCount: Number(raw.activeMemberCount ?? (members.length ? members.reduce((sum, member) => sum + Number(member.memberCount ?? 0), 0) : raw.memberCount ?? 0)), recommendationReasons: reasons.map((reason) => reasonMap[String(reason)]).filter(Boolean) } as Trip
}

function normalizeTripState(value: any): Trip {
  const trip = value.trip ?? value
  return normalizeTrip({ ...trip, status: value.tripStatus ?? trip.status, confirmationId: value.confirmation?.id, retractUntil: value.retractUntil ?? value.confirmation?.retractUntil, confirmedCount: value.confirmedCount ?? value.confirmationCount })
}
