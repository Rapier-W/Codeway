import { ApiError, type ApiClient, type CreateTripInput, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip } from './contracts'

const sampleTrips: Trip[] = [
  { id: 'trip-1', origin: '大学城南门', destination: '火车站', departureAt: '2026-08-25T20:00:00+08:00', capacity: 4, activeMemberCount: 1, status: 'RECRUITING', recommendationReasons: ['TIME_CLOSE', 'VERIFIED', 'AVAILABLE'] },
  { id: 'trip-2', origin: '科技园', destination: '市民中心', departureAt: '2026-08-25T20:30:00+08:00', capacity: 3, activeMemberCount: 2, status: 'RECRUITING', recommendationReasons: ['RELIABLE', 'AVAILABLE'] },
  { id: 'trip-full', origin: '东站', destination: '西站', departureAt: '2026-08-25T21:00:00+08:00', capacity: 3, activeMemberCount: 3, status: 'RECRUITING', recommendationReasons: [] },
]

type MockOperation = 'listTrips' | 'joinTrip' | 'confirmTrip' | 'withdrawConfirmation'
type MockFailure = 'network' | 'conflict'

export interface MockApiOptions {
  failures?: Partial<Record<MockOperation, MockFailure>>
}

export class MockApiClient implements ApiClient {
  private readonly trips = structuredClone(sampleTrips)
  private readonly joins = new Map<string, JoinRequest>()
  private readonly failures: Partial<Record<MockOperation, MockFailure>>

  constructor(options: MockApiOptions = {}) {
    this.failures = options.failures ?? {}
  }

  async requestCode(_phone: string, _idempotencyKey: string): Promise<void> {}

  async verifyCode(_phone: string, code: string, _idempotencyKey: string): Promise<SessionUser> {
    if (code !== '123456') throw new ApiError('VERIFICATION_CODE_INVALID', '验证码无效', 400)
    return { id: 'user-demo', nickname: '演示用户', phoneVerified: true }
  }

  async listTrips(): Promise<Trip[]> {
    this.throwConfiguredFailure('listTrips')
    return this.trips
      .filter((trip) => trip.status === 'RECRUITING' && trip.activeMemberCount < trip.capacity)
      .map((trip) => structuredClone(trip))
  }
  async getTrip(tripId: string): Promise<Trip> {
    return this.findTrip(tripId)
  }

  async createTrip(input: CreateTripInput, _idempotencyKey: string): Promise<Trip> {
    const trip: Trip = { id: `trip-${this.trips.length + 1}`, ...input, activeMemberCount: 1, status: 'RECRUITING', recommendationReasons: ['VERIFIED', 'AVAILABLE'] }
    this.trips.push(trip)
    return structuredClone(trip)
  }

  async joinTrip(tripId: string, input: JoinTripInput, idempotencyKey: string): Promise<JoinRequest> {
    this.throwConfiguredFailure('joinTrip')
    const existing = this.joins.get(idempotencyKey)
    if (existing) return structuredClone(existing)
    const trip = this.trips.find((candidate) => candidate.id === tripId)
    if (!trip) throw new ApiError('TRIP_NOT_FOUND', '行程不存在', 404)
    if (trip.activeMemberCount + input.memberCount > trip.capacity) {
      throw new ApiError('TRIP_CAPACITY_EXCEEDED', '剩余座位不足，请刷新行程状态', 409)
    }
    const request: JoinRequest = { id: `join-${this.joins.size + 1}`, tripId, memberCount: input.memberCount, status: 'PENDING' }
    this.joins.set(idempotencyKey, request)
    return structuredClone(request)
  }

  async confirmTrip(tripId: string, _idempotencyKey: string): Promise<Trip> {
    this.throwConfiguredFailure('confirmTrip')
    const trip = this.findTripReference(tripId)
    if (trip.status !== 'RECRUITING' || trip.activeMemberCount !== trip.capacity - 1) {
      throw new ApiError('TRIP_NOT_READY', '尚未达到全员确认条件，请刷新行程状态', 409)
    }
    trip.status = 'FORMED'
    return structuredClone(trip)
  }

  async withdrawConfirmation(tripId: string, _confirmationId: string, _idempotencyKey: string): Promise<Trip> {
    this.throwConfiguredFailure('withdrawConfirmation')
    const trip = this.findTripReference(tripId)
    if (trip.status !== 'FORMED') throw new ApiError('STATE_CONFLICT', '当前状态无法撤回确认，请刷新行程状态', 409)
    trip.status = 'RECRUITING'
    return structuredClone(trip)
  }
  async createSosEvent(_input: SosInput, _idempotencyKey: string): Promise<{ id: string; createdAt: string }> { return { id: 'sos-1', createdAt: new Date().toISOString() } }

  private findTrip(tripId: string) {
    return structuredClone(this.findTripReference(tripId))
  }

  private findTripReference(tripId: string) {
    const trip = this.trips.find((candidate) => candidate.id === tripId)
    if (!trip) throw new ApiError('TRIP_NOT_FOUND', '行程不存在', 404)
    return trip
  }

  private throwConfiguredFailure(operation: MockOperation) {
    const failure = this.failures[operation]
    if (failure === 'network') throw new ApiError('NETWORK_ERROR', '网络连接失败，请检查网络后重试', 0)
    if (failure === 'conflict') throw new ApiError('STATE_CONFLICT', '行程状态已变化，请刷新后重试', 409)
  }
}
