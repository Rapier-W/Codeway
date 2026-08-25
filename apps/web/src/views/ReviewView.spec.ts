import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewView from './ReviewView.vue'

const getOrder = vi.fn()
const getTrip = vi.fn()
vi.mock('../api/client', () => ({ createApiClient: () => ({ getOrder, getTrip, submitReview: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'order-1' }, query: {} }) }))

describe('ReviewView', () => {
  beforeEach(() => { setActivePinia(createPinia()); getOrder.mockReset(); getTrip.mockReset() })

  it('offers same-trip members as targets after loading the order', async () => {
    getOrder.mockResolvedValue({ id: 'order-1', tripId: 'trip-1', disputed: false, settlementLocked: false, costShare: { mode: 'EQUAL', amountCents: 100, confirmed: true } })
    getTrip.mockResolvedValue({ id: 'trip-1', origin: 'A', destination: 'B', departureAt: '2026-08-25T20:00:00Z', capacity: 3, activeMemberCount: 2, status: 'PENDING_REVIEW', recommendationReasons: [], members: [{ userId: 'u2', nickname: '同行乙' }, { userId: 'u3', nickname: '同行丙' }] })
    const wrapper = mount(ReviewView)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getOrder).toHaveBeenCalledWith('order-1')
    expect(getTrip).toHaveBeenCalledWith('trip-1')
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual(['请选择同行', '同行乙', '同行丙'])
  })
})
