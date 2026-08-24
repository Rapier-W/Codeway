import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import TripsView from './TripsView.vue'
import { useTripsStore } from '../stores/trips'

test('offers publish action when no trips are available', async () => {
  setActivePinia(createPinia())
  const store = useTripsStore()
  store.items = []
  vi.spyOn(store, 'load').mockResolvedValue()
  const wrapper = mount(TripsView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await Promise.resolve()
  expect(wrapper.text()).toContain('发布行程')
})
