import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip } from './contracts'

export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api') {}
  requestCode(phone: string, idempotencyKey: string) { return this.write<void>('/auth/request-code', { phone }, idempotencyKey) }
  verifyCode(phone: string, code: string, idempotencyKey: string) { return this.write<SessionUser>('/auth/verify-code', { phone, code }, idempotencyKey) }
  listTrips() { return this.request<Trip[]>('/trips') }
  createTrip(input: CreateTripInput, idempotencyKey: string) { return this.write<Trip>('/trips', input, idempotencyKey) }
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string) { return this.write<JoinRequest>(`/trips/${tripId}/join`, input, idempotencyKey) }
  confirmTrip(tripId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirm`, {}, idempotencyKey) }
  withdrawConfirmation(tripId: string, idempotencyKey: string) { return this.write<Trip>(`/trips/${tripId}/confirmation/withdraw`, {}, idempotencyKey) }
  createSosEvent(input: SosInput, idempotencyKey: string) { return this.write<{ id: string; createdAt: string }>('/sos-events', input, idempotencyKey) }

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
