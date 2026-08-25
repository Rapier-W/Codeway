export type TripStatus = 'RECRUITING' | 'CONFIRMING' | 'FORMED' | 'WAITING_RIDE' | 'RIDE_BOOKED' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'PENDING_REVIEW' | 'ARCHIVED' | 'ORDER_DISPUTED' | 'CANCELLED' | 'EXPIRED'
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

export interface TripMember { userId: string; role?: string; memberCount?: number; nickname?: string }

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
  fareOrderId?: string
  members?: TripMember[]
}

export interface JoinTripInput { memberCount: 1 | 2 }
export interface JoinRequest { id: string; tripId: string; memberCount: 1 | 2; status: JoinRequestStatus }
export interface CreateTripInput { origin: string; destination: string; departureAt: string; capacity: 3 | 4 }
export interface SosInput { tripId?: string; note?: string }
export interface ChatMessage { id: string; senderId: string; text: string; createdAt: string }
export interface MessagePage { messages: ChatMessage[]; hasMore: boolean; nextCursor: string | null }
export interface CostShare { mode: 'EQUAL'|'FIXED'|'CUSTOM'; amountCents: number; confirmed: boolean }
export interface Vehicle { plate: string; model?: string; color?: string }
export interface RideLaunch { launch: { supported: boolean; copyRouteRequired: boolean }; status?: string }
export interface Order { id: string; tripId: string; status?: string; disputed: boolean; settlementLocked: boolean; costShare: CostShare; totalAmountCents?: number; members?: TripMember[] }
export interface EmergencyContact { id?: string; name: string; phone: string }
export interface ReviewInput { fareOrderId: string; targetUserId: string; dimensions: { punctuality:number; communication:number; safety:number; fairness:number }; comment?: string; anonymous: boolean }

export interface ApiClient {
  requestCode(phone: string, idempotencyKey: string): Promise<void>
  verifyCode(phone: string, code: string, idempotencyKey: string): Promise<SessionUser>
  devLogin(phone: string): Promise<SessionUser>
  listTrips(): Promise<Trip[]>
  listMyTrips(role: 'joined' | 'published'): Promise<Trip[]>
  getTrip(tripId: string): Promise<Trip>
  createTrip(input: CreateTripInput, idempotencyKey: string): Promise<Trip>
  joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string): Promise<JoinRequest>
  confirmTrip(tripId: string, idempotencyKey: string): Promise<Trip>
  withdrawConfirmation(tripId: string, confirmationId: string, idempotencyKey: string): Promise<Trip>
  createSosEvent(input: SosInput, idempotencyKey: string): Promise<{ id: string; createdAt: string }>
  listMessages(tripId: string): Promise<ChatMessage[]>
  listMessagesPage(tripId: string, options?: { before?: string; limit?: number }): Promise<MessagePage>
  sendMessage(tripId: string, text: string, idempotencyKey: string): Promise<ChatMessage>
  getOrder(orderId: string): Promise<Order>
  confirmOrder(orderId: string): Promise<unknown>
  disputeOrder(orderId: string, reason: string): Promise<unknown>
  updateVehicle(tripId: string, input: Vehicle, idempotencyKey?: string): Promise<unknown>
  openRide(tripId: string, platform: string, idempotencyKey?: string): Promise<unknown>
  addEmergencyContact(input: EmergencyContact, idempotencyKey?: string): Promise<unknown>
  confirmFareOrder(orderId: string, idempotencyKey: string): Promise<unknown>
  disputeFareOrder(orderId: string, reason: string, idempotencyKey: string): Promise<unknown>
  markPayment(orderId: string, amountCents: number | undefined, idempotencyKey: string): Promise<unknown>
  updateVehicleWithKey(tripId: string, input: Vehicle, idempotencyKey: string): Promise<unknown>
  openRideWithKey(tripId: string, platform: string, idempotencyKey: string): Promise<unknown>
  addEmergencyContactWithKey(input: EmergencyContact, idempotencyKey: string): Promise<unknown>
  submitReview(input: ReviewInput, idempotencyKey: string): Promise<void>
}
