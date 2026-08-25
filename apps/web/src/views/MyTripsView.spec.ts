import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyTripsView from './MyTripsView.vue'

const listMyTrips = vi.fn()
vi.mock('../api/client', () => ({ createApiClient: () => ({ listMyTrips }) }))

describe('MyTripsView', () => {
  beforeEach(() => listMyTrips.mockReset())

  it('loads joined trips from the API and changes role query when tab changes', async () => {
    listMyTrips.mockResolvedValue([{ id: 't1', origin: 'A', destination: 'B', departureAt: '2026-08-25T20:00:00Z', capacity: 3, activeMemberCount: 2, status: 'CONFIRMING', recommendationReasons: [], disputed: false }])
    const wrapper = mount(MyTripsView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listMyTrips).toHaveBeenCalledWith('joined')
    expect(wrapper.text()).toContain('A → B')
    await wrapper.get('button:last-of-type').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listMyTrips).toHaveBeenLastCalledWith('published')
  })
})
