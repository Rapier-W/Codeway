import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import JoinSheet from './JoinSheet.vue'

describe('JoinSheet accessibility', () => {
  it('focuses dialog on open and closes on Escape restoring focus', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const wrapper = mount(JoinSheet, { props: { open: false }, attachTo: document.body })
    await wrapper.setProps({ open: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog.element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
    trigger.remove()
  })
})
