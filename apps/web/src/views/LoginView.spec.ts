import { describe, expect, it } from 'vitest'
import { isDevLoginEnabled } from './login-mode'

describe('login mode', () => {
  it('uses real SMS verification unless dev login is explicitly enabled', () => {
    expect(isDevLoginEnabled('http', undefined)).toBe(false)
    expect(isDevLoginEnabled('http', 'false')).toBe(false)
    expect(isDevLoginEnabled('http', 'true')).toBe(true)
    expect(isDevLoginEnabled('mock', 'true')).toBe(false)
  })
})
