import { describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from './http-client'

describe('HttpApiClient', () => {
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
})
