import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ConfirmationPanel from './ConfirmationPanel.vue'
describe('ConfirmationPanel timer', () => {
  it('disables withdrawal after retract deadline', async () => {
    vi.useFakeTimers(); const until = new Date(Date.now() + 15000).toISOString(); const w = mount(ConfirmationPanel, { props: { status:'FORMED', confirmedCount:3, total:3, retractUntil: until } }); expect(w.text()).toContain('剩余'); vi.advanceTimersByTime(15001); await w.vm.$nextTick(); expect((w.get('button').element as HTMLButtonElement).disabled).toBe(true); vi.useRealTimers()
  })
})
