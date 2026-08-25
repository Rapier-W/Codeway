import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ChatView from './ChatView.vue'

const listMessagesPage = vi.fn()
const sendMessage = vi.fn()
vi.mock('../api/client', () => ({ createApiClient: () => ({ listMessagesPage, sendMessage }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 't1' } }) }))

describe('ChatView', () => {
  it('loads older messages and rejects pure whitespace messages', async () => {
    listMessagesPage.mockResolvedValueOnce({ messages: [{ id: 'new', senderId: 'u1', text: 'new', createdAt: '2026-08-25T20:00:00Z' }], hasMore: true, nextCursor: '2026-08-25T19:00:00Z' })
      .mockResolvedValueOnce({ messages: [{ id: 'old', senderId: 'u1', text: 'old', createdAt: '2026-08-25T19:00:00Z' }], hasMore: false, nextCursor: null })
    const wrapper = mount(ChatView)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.text()).toContain('new')
    await wrapper.get('[data-testid="load-older"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listMessagesPage).toHaveBeenLastCalledWith('t1', { before: '2026-08-25T19:00:00Z', limit: 30 })
    expect(wrapper.text()).toContain('old')
    await wrapper.get('input[aria-label="消息"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
