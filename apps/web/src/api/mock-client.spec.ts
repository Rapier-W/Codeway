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

  it('forms a confirming trip and returns it to recruiting when confirmation is withdrawn', async () => {
    const client = new MockApiClient()

    await expect(client.confirmTrip('trip-2', 'confirm-1')).resolves.toMatchObject({ status: 'FORMED' })
    await expect(client.withdrawConfirmation('trip-2', 'confirmation-1', 'withdraw-1')).resolves.toMatchObject({ status: 'RECRUITING' })
  })

  it('rejects confirmation before a trip is full', async () => {
    const client = new MockApiClient()

    await expect(client.confirmTrip('trip-1', 'confirm-2')).rejects.toMatchObject({ code: 'TRIP_NOT_READY', status: 409 })
  })
})
