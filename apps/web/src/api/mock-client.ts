import { ApiError, type ApiClient, type CreateTripInput, type FareScreenshotUpload, type FarePlan, type FarePlanInput, type FareChangeRequest, type FarePlanRevision, type JoinRequest, type JoinTripInput, type SessionUser, type SosInput, type Trip, type MessagePage, type Vehicle, type EmergencyContact } from './contracts'

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

  async getCurrentUser(): Promise<SessionUser | null> { return null }

  async requestCode(_phone: string, _idempotencyKey: string): Promise<void> {}

  async verifyCode(_phone: string, code: string, _idempotencyKey: string): Promise<SessionUser> {
    if (code !== '123456') throw new ApiError('VERIFICATION_CODE_INVALID', '验证码无效', 400)
    return { id: 'user-demo', nickname: '演示用户', phoneVerified: true }
  }

  async devLogin(phone: string): Promise<SessionUser> {
    return { id: `dev-${phone.replace(/\D/g, '') || 'user'}`, nickname: '开发用户', phoneVerified: true }
  }

  async listTrips(): Promise<Trip[]> {
    this.throwConfiguredFailure('listTrips')
    return this.trips
      .filter((trip) => trip.status === 'RECRUITING' && trip.activeMemberCount < trip.capacity)
      .map((trip) => structuredClone(trip))
  }
  async listMyTrips(_role: 'joined' | 'published'): Promise<Trip[]> { return this.trips.filter((trip) => trip.status !== 'CANCELLED').map((trip) => structuredClone(trip)) }
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
    if (!['RECRUITING','CONFIRMING'].includes(trip.status) || trip.activeMemberCount !== trip.capacity - 1) {
      throw new ApiError('TRIP_NOT_READY', '尚未达到全员确认条件，请刷新行程状态', 409)
    }
    trip.status = trip.status === 'RECRUITING' ? 'CONFIRMING' : 'FORMED'
    trip.confirmedCount = (trip.confirmedCount ?? 0) + 1
    if (trip.status === 'FORMED') { trip.retractUntil = new Date(Date.now() + 15000).toISOString(); trip.confirmationId = `confirmation-${tripId}` }
    return structuredClone(trip)
  }

  async withdrawConfirmation(tripId: string, _confirmationId: string, _idempotencyKey: string): Promise<Trip> {
    this.throwConfiguredFailure('withdrawConfirmation')
    const trip = this.findTripReference(tripId)
    if (!_confirmationId) throw new ApiError('CONFIRMATION_ID_REQUIRED', '缺少确认记录，无法撤回', 400)
    if (trip.status !== 'FORMED') throw new ApiError('STATE_CONFLICT', '当前状态无法撤回确认，请刷新行程状态', 409)
    if (trip.retractUntil && new Date(trip.retractUntil).getTime() <= Date.now()) throw new ApiError('RETRACT_WINDOW_EXPIRED', '反悔窗口已结束', 409)
    trip.status = 'RECRUITING'
    trip.confirmedCount = 0; trip.retractUntil = undefined; trip.confirmationId = undefined
    return structuredClone(trip)
  }
  async createSosEvent(_input: SosInput, _idempotencyKey: string): Promise<{ id: string; createdAt: string }> { return { id: 'sos-1', createdAt: new Date().toISOString() } }
  async listMessagesPage(_tripId: string): Promise<MessagePage> { return { messages: [{ id: 'msg-1', senderId: 'user-demo', text: '大家好，费用先按等额确认。', createdAt: new Date().toISOString() }], hasMore: false, nextCursor: null } }
  async listMessages(tripId: string) { return (await this.listMessagesPage(tripId)).messages }
  async sendMessage(_tripId: string, text: string, _idempotencyKey: string) { if (!text.trim()) throw new ApiError('MESSAGE_TEXT_REQUIRED', '消息不能为空', 400); return { id: `msg-${Date.now()}`, senderId: 'user-demo', text: text.trim(), createdAt: new Date().toISOString() } }
  async getOrder(orderId: string) { return { id: orderId, tripId: 'trip-1', disputed: false, settlementLocked: false, costShare: { mode: 'EQUAL' as const, amountCents: 1200, confirmed: false } } }
  async confirmOrder(_orderId: string) {}
  async disputeOrder(_orderId: string, _reason: string) {}
  async confirmFareOrder(_orderId: string, _key: string) { return { locked: false, duplicate: false } }
  async disputeFareOrder(_orderId: string, _reason: string, _key: string) { return { locked: true, duplicate: false } }
  async markPayment(_orderId: string, _amount: number | undefined, _key: string) { return { locked: false, duplicate: false } }
  async createFareScreenshotUpload(tripId: string, file: File, _idempotencyKey: string): Promise<FareScreenshotUpload> {
    return { uploadId: `upload-${Date.now()}`, objectKey: `fare-screenshots/mock/${tripId}/${file.name}`, uploadUrl: 'mock://fare-screenshot-upload', uploadToken: 'mock-upload-token', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
  }
  async uploadFareScreenshot(_upload: FareScreenshotUpload, _file: File): Promise<void> {}
  async createFareOrder(_tripId: string, _screenshotUploadId: string, _actualTotalFareCents: number, _idempotencyKey: string): Promise<unknown> { return { id: 'fare-order-1' } }
  async getFareScreenshotUrl(_orderId: string) { return { url: 'https://example.invalid/mock-private-fare-screenshot', expiresAt: new Date(Date.now() + 60 * 1000).toISOString() } }
  async updateVehicle(_tripId: string, _input: Vehicle, _key?: string) {}
  async openRide(_tripId: string, _platform: string, _key?: string) {}
  async addEmergencyContact(_input: EmergencyContact, _key?: string) {}
  async updateVehicleWithKey(_tripId: string, _input: Vehicle, _key: string) {}
  async openRideWithKey(_tripId: string, _platform: string, _key: string) {}
  async addEmergencyContactWithKey(_input: EmergencyContact, _key: string) {}
  async submitReview(_input: import('./contracts').ReviewInput, _idempotencyKey: string) {}

  // 阶段 2：费用方案修订（内存实现，仅用于开发与测试）。
  private readonly farePlans = new Map<string, FarePlan>()
  private readonly changeRequests = new Map<string, FareChangeRequest>()
  private revisionSeq = 0

  async getFarePlan(tripId: string): Promise<FarePlan> {
    return this.farePlans.get(tripId) ?? { tripId, feePlan: { mode: 'EQUAL', allocations: null, amountCents: null }, currentRevision: null }
  }
  async getCurrentFareChangeRequest(tripId: string): Promise<{ changeRequest: FareChangeRequest | null }> {
    return { changeRequest: this.changeRequests.get(tripId) ?? null }
  }
  async createFareChangeRequest(tripId: string, input: FarePlanInput, _idempotencyKey: string): Promise<{ id: string; duplicate: boolean }> {
    if (!['EQUAL', 'FIXED', 'CUSTOM'].includes(input.mode)) throw new ApiError('FARE_PLAN_MODE_INVALID', '费用方案模式无效', 400)
    if (input.mode === 'FIXED' && (!Number.isInteger(input.amountCents) || (input.amountCents ?? -1) < 0)) throw new ApiError('FARE_AMOUNT_INVALID', '金额填写有误', 400)
    if (input.mode === 'CUSTOM') {
      const total = Object.values(input.allocations ?? {}).reduce((sum, v) => sum + Number(v), 0)
      if (total !== 100) throw new ApiError('FARE_PLAN_PERCENT_TOTAL_INVALID', '自定义分摊比例之和必须为 100', 400)
    }
    const revision: FarePlanRevision = { id: `rev-${++this.revisionSeq}`, mode: input.mode, allocations: input.allocations ?? null, amountCents: input.amountCents ?? null, status: 'PENDING_CONFIRMATION', confirmations: [] }
    const changeRequest: FareChangeRequest = { id: `cr-${this.revisionSeq}`, status: 'PENDING', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), requestedBy: 'user-demo', revision, decisions: [] }
    this.changeRequests.set(tripId, changeRequest)
    return { id: changeRequest.id, duplicate: false }
  }
  async decideFareChangeRequest(tripId: string, changeRequestId: string, decision: 'APPROVED' | 'REJECTED', _idempotencyKey: string): Promise<{ changeRequestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'; duplicate: boolean }> {
    const existing = this.changeRequests.get(tripId)
    if (!existing || existing.id !== changeRequestId) throw new ApiError('FARE_PLAN_CHANGE_REQUEST_NOT_FOUND', '费用变更申请不存在', 404)
    if (existing.status !== 'PENDING') throw new ApiError('FARE_PLAN_CHANGE_ALREADY_RESOLVED', '该费用变更申请已结束', 409)
    // 重新声明为完整类型，解除上方状态守卫造成的属性收窄，便于后续展开覆盖 status。
    const cr: FareChangeRequest = existing
    if (new Date(cr.expiresAt).getTime() <= Date.now()) {
      const expired: FareChangeRequest = { id: cr.id, status: 'EXPIRED', expiresAt: cr.expiresAt, requestedBy: cr.requestedBy, revision: cr.revision, decisions: cr.decisions }
      this.changeRequests.set(tripId, expired)
      return { changeRequestStatus: 'EXPIRED', duplicate: false }
    }
    const decisions = cr.decisions.some((d) => d.userId === 'user-demo')
      ? cr.decisions
      : [...cr.decisions, { userId: 'user-demo', decision }]
    const changeRequestStatus = decision === 'REJECTED' ? 'REJECTED' as const : 'APPROVED' as const
    const updated: FareChangeRequest = { id: cr.id, status: changeRequestStatus, expiresAt: cr.expiresAt, requestedBy: cr.requestedBy, revision: cr.revision, decisions }
    this.changeRequests.set(tripId, updated)
    return { changeRequestStatus, duplicate: false }
  }

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
