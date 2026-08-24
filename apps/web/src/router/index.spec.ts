import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('app routes', () => {
  it('exposes the core navigation routes', () => {
    expect(router.getRoutes().map((route) => route.path)).toEqual(
      expect.arrayContaining(['/login', '/trips', '/trips/create', '/my-trips', '/profile']),
    )
  })

  it('names every directly navigable route', () => {
    expect(router.getRoutes().filter((route) => route.path !== '/').every((route) => Boolean(route.name))).toBe(true)
  })
})
