import type { ApiClient } from './contracts'
import { HttpApiClient } from './http-client'
import { MockApiClient } from './mock-client'

export const createApiClient = (): ApiClient => import.meta.env.VITE_API_MODE === 'http' ? new HttpApiClient() : new MockApiClient()
