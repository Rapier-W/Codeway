import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip, type ChatMessage, type Order, type ReviewInput } from './contracts'

export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}
  requestCode(phone: string, idempotencyKey: string) { return this.write<void>('/auth/request-code', { phone }, idempotencyKey) }
  verifyCode(phone: string, code: string, idempotencyKey: string) { return this.write<SessionUser>('/auth/verify-code', { phone, code }, idempotencyKey) }
  async listTrips() { return (await this.request<unknown[]>('/trips')).map(normalizeTrip) }
  async getTrip(tripId: string) { return normalizeTrip(await this.request<unknown>(`/trips/${tripId}`)) }
  async createTrip(input: CreateTripInput, idempotencyKey: string) { return normalizeTrip(await this.write<unknown>('/trips', input, idempotencyKey)) }
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string) { return this.write<JoinRequest>(`/trips/${tripId}/join`, input, idempotencyKey) }
  confirmTrip(tripId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirmations`, {}, idempotencyKey) }
  withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirmations/${confirmationId}/withdraw`, {}, idempotencyKey) }
  createSosEvent(input: SosInput, idempotencyKey: string) { return this.write<{ id: string; createdAt: string }>('/sos-events', input, idempotencyKey) }
  listMessages(tripId: string) { return this.request<ChatMessage[]>(`/trips/${encodeURIComponent(tripId)}/messages`) }
  sendMessage(tripId: string, text: string, idempotencyKey: string) { return this.write<ChatMessage>(`/trips/${encodeURIComponent(tripId)}/messages`, { text }, idempotencyKey) }
  getOrder(orderId: string) { return this.request<Order>(`/orders/${encodeURIComponent(orderId)}`) }
  async submitReview(input: ReviewInput, idempotencyKey: string) { await this.write<void>('/reviews', input, idempotencyKey) }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { credentials: 'include', ...init })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string }
      throw new ApiError(body.code ?? (response.status === 409 ? 'STATE_CONFLICT' : 'REQUEST_FAILED'), body.message ?? '请求失败，请稍后再试', response.status)
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
