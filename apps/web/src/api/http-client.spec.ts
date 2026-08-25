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
})
