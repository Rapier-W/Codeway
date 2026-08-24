import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RideFallback from './RideFallback.vue'

describe('RideFallback', () => {
  it('provides manual dial and clipboard actions', async () => {
    const w = mount(RideFallback, { props: { phone: '13800138000', text: '大学城南门 → 火车站' } })
    expect(w.text()).toContain('手动联系')
    expect(w.get('a').attributes('href')).toBe('tel:13800138000')
  })
})
