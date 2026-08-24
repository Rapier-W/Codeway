import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router } from './index'
import { useSessionStore } from '../stores/session'

describe('app routes', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('exposes the core navigation routes', () => {
    expect(router.getRoutes().map((route) => route.path)).toEqual(
      expect.arrayContaining(['/login', '/trips', '/trips/create', '/my-trips', '/profile']),
    )
  })

  it('names every directly navigable route', () => {
    expect(router.getRoutes().filter((route) => route.path !== '/').every((route) => Boolean(route.name))).toBe(true)
  })

  it('redirects unauthenticated protected routes to login with a safe same-origin redirect', async () => {
    await router.push('/trips/create')
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/trips/create')
    await router.push('/trips/abc')
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/trips/abc')
  })

  it('allows public trips and authenticated protected routes', async () => {
    await router.push('/trips')
    expect(router.currentRoute.value.name).toBe('trips')
    useSessionStore().user = { id: 'u1', nickname: 'Test', phoneVerified: true }
    await router.push('/trips/create')
    expect(router.currentRoute.value.name).toBe('trip-create')
  })
})
