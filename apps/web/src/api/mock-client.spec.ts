import { describe, expect, it } from 'vitest'
import { MockApiClient } from './mock-client'

describe('MockApiClient', () => {
  it('creates a pending join request for one or two seats', async () => {
    const client = new MockApiClient()

    await expect(client.joinTrip('trip-1', { memberCount: 2 }, 'key-1')).resolves.toMatchObject({
      status: 'PENDING',
    })
  })

  it('rejects a join request that exceeds available capacity', async () => {
    const client = new MockApiClient()

    await expect(client.joinTrip('trip-full', { memberCount: 1 }, 'key-2')).rejects.toMatchObject({
      code: 'TRIP_CAPACITY_EXCEEDED',
    })
  })

  it('loads a requested trip even when it is full', async () => {
    await expect(new MockApiClient().getTrip('trip-full')).resolves.toMatchObject({ id: 'trip-full', activeMemberCount: 3 })
  })

  it('returns a typed state conflict when configured for a write operation', async () => {
    const client = new MockApiClient({ failures: { joinTrip: 'conflict' } })

    await expect(client.joinTrip('trip-1', { memberCount: 1 }, 'key-3')).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
      status: 409,
    })
  })

  it('returns a typed network error when configured', async () => {
    const client = new MockApiClient({ failures: { listTrips: 'network' } })

    await expect(client.listTrips()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })

  it('requires all member confirmations then allows a 15 second withdrawal', async () => {
    const client = new MockApiClient()
    const first = await client.confirmTrip('trip-2', 'confirm-1')
    expect(first).toMatchObject({ status: 'CONFIRMING', confirmedCount: 1 })
    const formed = await client.confirmTrip('trip-2', 'confirm-2')
    expect(formed.status).toBe('FORMED')
    expect(formed.retractUntil).toBeTruthy()
    await expect(client.withdrawConfirmation('trip-2', '', 'withdraw-1')).rejects.toMatchObject({ code: 'CONFIRMATION_ID_REQUIRED' })
    await expect(client.withdrawConfirmation('trip-2', formed.confirmationId!, 'withdraw-1')).resolves.toMatchObject({ status: 'RECRUITING', confirmedCount: 0 })
  })

  it('rejects confirmation before a trip is full', async () => {
    const client = new MockApiClient()

    await expect(client.confirmTrip('trip-1', 'confirm-2')).rejects.toMatchObject({ code: 'TRIP_NOT_READY', status: 409 })
  })
})
