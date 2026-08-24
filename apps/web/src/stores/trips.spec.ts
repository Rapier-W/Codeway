import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MockApiClient } from '../api/mock-client'
import { useTripsStore } from './trips'

describe('trips store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads recruiting trips returned by the adapter', async () => {
    const store = useTripsStore()

    await store.load(new MockApiClient())

    expect(store.items).toHaveLength(2)
    expect(store.items.every((trip) => trip.status === 'RECRUITING')).toBe(true)
  })
})
