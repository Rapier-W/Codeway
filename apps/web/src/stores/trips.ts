import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiClient, Trip } from '../api/contracts'
import { createApiClient } from '../api/client'

export const useTripsStore = defineStore('trips', () => {
  const items = ref<Trip[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)
  async function load(client: ApiClient = createApiClient()) {
    loading.value = true; error.value = null
    try { items.value = await client.listTrips() } catch (caught) { error.value = caught instanceof Error ? caught : new Error('加载行程失败') } finally { loading.value = false }
  }
  return { items, loading, error, load }
})
