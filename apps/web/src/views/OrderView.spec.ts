import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderView from './OrderView.vue'

const getOrder = vi.fn()
const createFareScreenshotUpload = vi.fn()
const uploadFareScreenshot = vi.fn()
const createFareOrder = vi.fn()
const getFareScreenshotUrl = vi.fn()

vi.mock('../api/client', () => ({ createApiClient: () => ({
  getOrder,
  confirmOrder: vi.fn(),
  disputeOrder: vi.fn(),
  createFareScreenshotUpload,
  uploadFareScreenshot,
  createFareOrder,
  getFareScreenshotUrl,
}) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'order-1' } }) }))

const order = { id: 'order-1', tripId: 'trip-1', disputed: false, settlementLocked: false, costShare: { mode: 'EQUAL' as const, amountCents: 1200, confirmed: false } }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const upload = { uploadId: 'upload-1', objectKey: 'fare-screenshots/u1/t1/receipt.png', uploadUrl: 'https://upload.example.test', uploadToken: 'grant-token', expiresAt: '2026-08-26T10:10:00.000Z' }

async function chooseFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

async function setActualFare(wrapper: ReturnType<typeof mount>) {
  await wrapper.findAll('input[inputmode="numeric"]')[0].setValue('1200')
}

describe('OrderView fare screenshot flow', () => {
  beforeEach(() => {
    getOrder.mockReset().mockResolvedValue(order)
    createFareScreenshotUpload.mockReset().mockResolvedValue(upload)
    uploadFareScreenshot.mockReset().mockResolvedValue(undefined)
    createFareOrder.mockReset().mockResolvedValue({ id: 'order-1' })
    getFareScreenshotUrl.mockReset().mockResolvedValue({ url: 'https://private.example.test/short-lived', expiresAt: '2026-08-26T10:01:00.000Z' })
  })

  it('rejects GIFs and files larger than 10MB before requesting an intent', async () => {
    const wrapper = mount(OrderView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()

    await chooseFile(wrapper, new File(['gif'], 'receipt.gif', { type: 'image/gif' }))
    expect(wrapper.text()).toContain('仅支持 JPEG、PNG 或 WebP 格式的截图')
    await chooseFile(wrapper, new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
    expect(wrapper.text()).toContain('截图不能超过 10MB')
    expect(createFareScreenshotUpload).not.toHaveBeenCalled()
  })

  it('shows upload failure and obtains a fresh intent when retrying', async () => {
    uploadFareScreenshot.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined)
    const wrapper = mount(OrderView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    await chooseFile(wrapper, new File(['png'], 'receipt.png', { type: 'image/png' }))
    await setActualFare(wrapper)
    await wrapper.get('[data-test="submit-fare-screenshot"]').trigger('click')
    await flush()

    expect(wrapper.text()).toContain('截图上传失败，请重试')
    await wrapper.get('[data-test="retry-fare-screenshot"]').trigger('click')
    await flush()
    expect(createFareScreenshotUpload).toHaveBeenCalledTimes(2)
    expect(uploadFareScreenshot).toHaveBeenCalledTimes(2)
  })

  it('disables submit while the upload is in progress', async () => {
    let resolveUpload: (() => void) | undefined
    uploadFareScreenshot.mockImplementation(() => new Promise<void>((resolve) => { resolveUpload = resolve }))
    const wrapper = mount(OrderView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flush()
    await chooseFile(wrapper, new File(['png'], 'receipt.png', { type: 'image/png' }))
    await setActualFare(wrapper)
    await wrapper.get('[data-test="submit-fare-screenshot"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="submit-fare-screenshot"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在上传截图…')
    resolveUpload?.()
  })

  it('fetches and opens a short-lived screenshot URL only after an explicit click', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = mount(OrderView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    expect(wrapper.find('[data-test="view-fare-screenshot"]').exists()).toBe(false)
    await flush()

    await wrapper.get('[data-test="view-fare-screenshot"]').trigger('click')
    await flush()
    expect(getFareScreenshotUrl).toHaveBeenCalledWith('order-1')
    expect(open).toHaveBeenCalledWith('https://private.example.test/short-lived', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})
