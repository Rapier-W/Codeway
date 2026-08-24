import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrderConflictBanner from './OrderConflictBanner.vue'

describe('OrderConflictBanner', () => {
  it('locks settlement when disputed', () => {
    const w = mount(OrderConflictBanner, { props: { disputed: true } })
    expect(w.text()).toContain('争议处理中')
    expect(w.attributes('role')).toBe('alert')
  })
})
