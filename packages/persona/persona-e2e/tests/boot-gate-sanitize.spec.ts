import { describe, expect, it } from 'vitest'
import { sanitizeBootstrapPageErrors } from '../src/boot-gate-bootstrap.ts'

describe('sanitizeBootstrapPageErrors', () => {
  it('drops resource storms and caps gateway/internal noise', () => {
    const noisy = [
      'console.error Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES',
      'pageerror Error: gateway/internal',
      'pageerror Error: gateway/internal',
      'pageerror Error: gateway/internal',
      'console.error real failure',
    ]
    expect(sanitizeBootstrapPageErrors(noisy)).toEqual([
      'pageerror Error: gateway/internal',
      'console.error real failure',
    ])
  })
})
