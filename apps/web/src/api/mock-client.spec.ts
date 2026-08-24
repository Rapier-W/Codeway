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
})
