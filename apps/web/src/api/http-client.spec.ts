import { describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from './http-client'

describe('HttpApiClient', () => {
  it('loads my trips by role and maps member totals from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 't1', origin: 'A', destination: 'B', departTime: '2026-08-25T20:00:00+08:00', capacity: 4, status: 'FORMED', members: [{ userId: 'u1', memberCount: 1 }, { userId: 'u2', memberCount: 2 }] },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const trips = await new HttpApiClient('http://api.test').listMyTrips('joined')

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/trips/mine?role=joined', expect.anything())
    expect(trips[0]).toMatchObject({ id: 't1', activeMemberCount: 3, members: [{ userId: 'u1', memberCount: 1 }, { userId: 'u2', memberCount: 2 }] })
  })

  it('loads a cursor page of chat history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [], hasMore: true, nextCursor: '2026-08-25T19:00:00.000Z' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new HttpApiClient('http://api.test').listMessagesPage('t1', { before: '2026-08-25T20:00:00.000Z', limit: 10 })).resolves.toMatchObject({ hasMore: true, nextCursor: '2026-08-25T19:00:00.000Z' })
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/trips/t1/messages?before=2026-08-25T20%3A00%3A00.000Z&limit=10', expect.anything())
  })
  it('sends the development user header and maps backend reason codes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 't1', origin: 'A', destination: 'B', departTime: '2026-08-25T20:00:00+08:00', capacity: 3, activeMemberCount: 1, status: 'RECRUITING', reasonCodes: ['OPEN_SLOT'] },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    HttpApiClient.currentUserId = 'user-1'

    const trips = await new HttpApiClient('http://api.test').listTrips()

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/trips', expect.objectContaining({ credentials: 'include', headers: { 'x-user-id': 'user-1' } }))
    expect(trips[0]).toMatchObject({ departureAt: '2026-08-25T20:00:00+08:00', recommendationReasons: ['AVAILABLE'] })
    HttpApiClient.currentUserId = null
  })

  it('maps Nest error messages into stable ApiError codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: 409, code: 'TRIP_CAPACITY_EXCEEDED', message: '容量不足' }), { status: 409 })))
    await expect(new HttpApiClient('http://api.test').listTrips()).rejects.toMatchObject({ code: 'TRIP_CAPACITY_EXCEEDED', status: 409 })
  })

  it('loads role-scoped trips and sums occupied seats from backend members', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: 't1', origin: 'A', destination: 'B', departTime: '2026-08-26T10:00:00.000Z', capacity: 4,
        members: [{ memberCount: 1 }, { memberCount: 2 }], status: 'FORMED', fareOrderId: 'o1', role: 'published',
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const trips = await new HttpApiClient('http://api.test').listMyTrips('published')

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/trips/mine?role=published', expect.objectContaining({ credentials: 'include' }))
    expect(trips[0]).toMatchObject({ activeMemberCount: 3, fareOrderId: 'o1', status: 'FORMED' })
  })

  it('sends idempotent fare, vehicle, ride and contact writes and preserves chat cursors', async () => {
    const responses = [
      { status: 200, body: { fareOrder: { id: 'o1' } } },
      { status: 200, body: { fareOrder: { id: 'o1' }, locked: true } },
      { status: 200, body: { plate: '粤A12345' } },
      { status: 200, body: { launch: { supported: false, copyRouteRequired: true } } },
      { status: 201, body: { id: 'c1', name: '家人', phone: '13800138000' } },
      { status: 200, body: { messages: [], hasMore: true, nextCursor: '2026-08-26T09:00:00.000Z' } },
    ]
    const fetchMock = vi.fn().mockImplementation(async () => {
      const next = responses.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new HttpApiClient('http://api.test')

    await client.confirmFareOrder('o1', 'key-1')
    await client.disputeFareOrder('o1', '费用不一致', 'key-2')
    await client.updateVehicle('t1', { plate: '粤A12345' }, 'key-3')
    await client.openRide('t1', 'didi', 'key-4')
    await client.addEmergencyContact({ name: '家人', phone: '13800138000' }, 'key-5')
    await expect(client.listMessagesPage('t1', { before: '2026-08-26T10:00:00.000Z', limit: 20 })).resolves.toMatchObject({ hasMore: true, nextCursor: expect.any(String) })

    expect(fetchMock.mock.calls.slice(0, 5).every(([, init]) => {
      const headers = (init as RequestInit).headers as Record<string, string>
      return Boolean(headers?.['Idempotency-Key'])
    })).toBe(true)
  })

  it('creates an upload intent, uploads the file without app auth, then submits only uploadId', async () => {
    const responses = [
      { status: 201, body: { uploadId: 'upload-1', objectKey: 'fare-screenshots/u1/t1/receipt.png', uploadUrl: 'https://upload.example.test', uploadToken: 'grant-token', expiresAt: '2026-08-26T10:10:00.000Z' } },
      { status: 200, body: {} },
      { status: 201, body: { id: 'order-1' } },
    ]
    const fetchMock = vi.fn().mockImplementation(async () => {
      const next = responses.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    HttpApiClient.currentUserId = 'user-1'
    const client = new HttpApiClient('http://api.test')
    const file = new File(['png'], 'receipt.png', { type: 'image/png' })

    const upload = await client.createFareScreenshotUpload('trip-1', file, 'intent-key')
    await client.uploadFareScreenshot(upload, file)
    await client.createFareOrder('trip-1', upload.uploadId, 1200, 'order-key')

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://api.test/trips/trip-1/fare-screenshot-uploads', expect.objectContaining({
      headers: expect.objectContaining({ 'x-user-id': 'user-1', 'Idempotency-Key': 'intent-key' }),
      body: JSON.stringify({ mimeType: 'image/png', sizeBytes: file.size }),
    }))
    const directUpload = fetchMock.mock.calls[1][1] as RequestInit
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://upload.example.test', expect.objectContaining({ method: 'POST', body: expect.any(FormData), credentials: 'omit' }))
    expect(directUpload.headers).toBeUndefined()
    const formData = directUpload.body as FormData
    expect(formData.get('token')).toBe('grant-token')
    expect(formData.get('file')).toBe(file)
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://api.test/trips/trip-1/fare-order', expect.objectContaining({
      body: JSON.stringify({ screenshotUploadId: 'upload-1', actualTotalFareCents: 1200 }),
    }))
    HttpApiClient.currentUserId = null
  })

  it('requests a private screenshot URL only when asked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://private.example.test/short-lived', expiresAt: '2026-08-26T10:01:00.000Z' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new HttpApiClient('http://api.test').getFareScreenshotUrl('order-1')).resolves.toMatchObject({ expiresAt: '2026-08-26T10:01:00.000Z' })
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/fare-orders/order-1/screenshot', expect.anything())
  })
})
