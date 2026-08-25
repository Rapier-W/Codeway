export type TripStatus = 'RECRUITING' | 'CONFIRMING' | 'FORMED' | 'CANCELLED' | 'EXPIRED'
export type JoinRequestStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'RELEASED'

export interface ApiErrorShape {
  code: string
  message: string
  status: number
}

export class ApiError extends Error implements ApiErrorShape {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface SessionUser {
  id: string
  nickname: string
  phoneVerified: boolean
}

export interface Trip {
  id: string
  origin: string
  destination: string
  departureAt: string
  capacity: 3 | 4
  activeMemberCount: number
  status: TripStatus
  recommendationReasons: Array<'TIME_CLOSE' | 'RELIABLE' | 'VERIFIED' | 'AVAILABLE'>
  confirmedCount?: number
  retractUntil?: string
  confirmationId?: string
}

export interface JoinTripInput { memberCount: 1 | 2 }
export interface JoinRequest { id: string; tripId: string; memberCount: 1 | 2; status: JoinRequestStatus }
export interface CreateTripInput { origin: string; destination: string; departureAt: string; capacity: 3 | 4 }
export interface SosInput { tripId?: string; note?: string }
export interface ChatMessage { id: string; senderId: string; text: string; createdAt: string }
export interface CostShare { mode: 'EQUAL'|'FIXED'|'CUSTOM'; amountCents: number; confirmed: boolean }
export interface Vehicle { plate: string; model?: string; color?: string }
export interface Order { id: string; tripId: string; disputed: boolean; settlementLocked: boolean; costShare: CostShare }
export interface ReviewInput { orderId: string; dimensions: { punctuality:number; communication:number; safety:number; fairness:number }; comment?: string; anonymous: boolean }

export interface ApiClient {
  requestCode(phone: string, idempotencyKey: string): Promise<void>
  verifyCode(phone: string, code: string, idempotencyKey: string): Promise<SessionUser>
  devLogin(phone: string): Promise<SessionUser>
  listTrips(): Promise<Trip[]>
  getTrip(tripId: string): Promise<Trip>
  createTrip(input: CreateTripInput, idempotencyKey: string): Promise<Trip>
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string): Promise<JoinRequest>
  confirmTrip(tripId: string, idempotencyKey: string): Promise<Trip>
  withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string): Promise<Trip>
  createSosEvent(input: SosInput, idempotencyKey: string): Promise<{ id: string; createdAt: string }>
  listMessages(tripId: string): Promise<ChatMessage[]>
  sendMessage(tripId: string, text: string, idempotencyKey: string): Promise<ChatMessage>
  getOrder(orderId: string): Promise<Order>
  submitReview(input: ReviewInput, idempotencyKey: string): Promise<void>
}
