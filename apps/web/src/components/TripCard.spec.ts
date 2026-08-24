import { mount } from '@vue/test-utils'
import TripCard from './TripCard.vue'
import type { Trip } from '../api/contracts'

const trip: Trip = { id: 't1', origin: '大学城南门', destination: '火车站', departureAt: '2026-08-25T20:00:00+08:00', capacity: 4, activeMemberCount: 1, status: 'RECRUITING', recommendationReasons: ['TIME_CLOSE', 'AVAILABLE'] }

test('renders whitelisted recommendation reasons and occupancy', () => {
  const wrapper = mount(TripCard, { props: { trip } })
  expect(wrapper.text()).toContain('时间相近')
  expect(wrapper.text()).toContain('1/4 人')
})
