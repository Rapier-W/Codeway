import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SosView from './SosView.vue'

describe('SosView', () => {
  it('requires a hold before recording an SOS event', async () => {
    const createSosEvent = vi.fn().mockResolvedValue({ id: 's1', createdAt: new Date().toISOString() })
    const wrapper = mount(SosView, { global: { provide: { createSosEvent } } })
    expect(createSosEvent).not.toHaveBeenCalled()
    await wrapper.get('button.sos-button').trigger('pointerdown')
    await wrapper.get('button.sos-button').trigger('pointerup')
    expect(createSosEvent).not.toHaveBeenCalled()
  })
})
