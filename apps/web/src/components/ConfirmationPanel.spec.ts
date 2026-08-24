import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConfirmationPanel from './ConfirmationPanel.vue'

describe('ConfirmationPanel', () => {
  it('emits confirm and shows retract countdown', async () => {
    const w = mount(ConfirmationPanel, { props: { status: 'CONFIRMING', confirmedCount: 1, total: 3 } })
    await w.get('button').trigger('click')
    expect(w.emitted('confirm')).toBeTruthy()
    expect(w.text()).toContain('1/3')
  })
})
