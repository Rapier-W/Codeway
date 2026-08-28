import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTrip = vi.fn()
const getFarePlan = vi.fn()
const getCurrentFareChangeRequest = vi.fn()
const createFareChangeRequest = vi.fn()
const decideFareChangeRequest = vi.fn()

// vi.hoisted 确保被 mock 工厂捕获的会话状态不受提升影响。
const sessionState = vi.hoisted(() => ({ userId: null as string | null }))

vi.mock('../api/client', () => ({ createApiClient: () => ({
  getTrip,
  getFarePlan,
  getCurrentFareChangeRequest,
  createFareChangeRequest,
  decideFareChangeRequest,
}) }))

vi.mock('../stores/session', () => ({ useSessionStore: () => ({
  user: sessionState.userId ? { id: sessionState.userId, nickname: '', phoneVerified: true } : null,
}) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'trip-1' } }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))

import FarePlanView from './FarePlanView.vue'

const trip = {
  id: 'trip-1',
  origin: '大学城',
  destination: '火车站',
  departureAt: '2026-08-25T20:00:00+08:00',
  capacity: 4,
  activeMemberCount: 2,
  status: 'FORMED' as const,
  recommendationReasons: [] as Array<'TIME_CLOSE' | 'RELIABLE' | 'VERIFIED' | 'AVAILABLE'>,
  creatorId: 'user-creator',
  members: [
    { userId: 'user-creator', role: 'CREATOR', memberCount: 1, nickname: '发单人' },
    { userId: 'user-member', role: 'MEMBER', memberCount: 1, nickname: '成员A' },
  ],
}
const plan = { tripId: 'trip-1', feePlan: { mode: 'EQUAL' as const, allocations: null, amountCents: null }, currentRevision: null }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.userId = null
  getTrip.mockResolvedValue(trip)
  getFarePlan.mockResolvedValue(plan)
  getCurrentFareChangeRequest.mockResolvedValue({ changeRequest: null })
})

describe('FarePlanView', () => {
  it('shows the current plan and the creator proposal form', async () => {
    sessionState.userId = 'user-creator'
    const wrapper = mount(FarePlanView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    expect(wrapper.text()).toContain('当前生效方案')
    expect(wrapper.text()).toContain('均摊')
    expect(wrapper.text()).toContain('发起费用变更')
  })

  it('lets a non-creator member vote when a pending change request exists', async () => {
    sessionState.userId = 'user-member'
    getCurrentFareChangeRequest.mockResolvedValue({
      changeRequest: {
        id: 'cr-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        requestedBy: 'user-creator',
        revision: { id: 'rev-1', mode: 'FIXED', allocations: null, amountCents: 5000, status: 'PENDING_CONFIRMATION', confirmations: [] },
        decisions: [{ userId: 'user-creator', decision: 'APPROVED' }],
      },
    })
    const wrapper = mount(FarePlanView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    expect(wrapper.text()).toContain('成员A')
    // 成员A 尚未表决，应出现表决按钮
    const approve = wrapper.findAll('button').find((b) => b.text() === '同意')
    const reject = wrapper.findAll('button').find((b) => b.text() === '拒绝')
    expect(approve).toBeTruthy()
    expect(reject).toBeTruthy()
    await approve!.trigger('click')
    await flush()
    expect(decideFareChangeRequest).toHaveBeenCalledWith('trip-1', 'cr-1', 'APPROVED', expect.any(String))
  })

  it('hides voting for the creator of a pending request', async () => {
    sessionState.userId = 'user-creator'
    getCurrentFareChangeRequest.mockResolvedValue({
      changeRequest: {
        id: 'cr-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        requestedBy: 'user-creator',
        revision: { id: 'rev-1', mode: 'EQUAL', allocations: null, amountCents: null, status: 'PENDING_CONFIRMATION', confirmations: [] },
        decisions: [],
      },
    })
    const wrapper = mount(FarePlanView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    expect(wrapper.text()).toContain('你是发单人，等待成员表决')
    expect(wrapper.findAll('button').some((b) => b.text() === '同意')).toBe(false)
  })

  it('submits a change request as the creator', async () => {
    sessionState.userId = 'user-creator'
    createFareChangeRequest.mockResolvedValue({ id: 'cr-new', duplicate: false })
    const wrapper = mount(FarePlanView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    const submit = wrapper.findAll('button').find((b) => b.text() === '提交变更申请')
    expect(submit).toBeTruthy()
    await submit!.trigger('click')
    await flush()
    expect(createFareChangeRequest).toHaveBeenCalledWith('trip-1', { mode: 'EQUAL' }, expect.any(String))
  })
})
