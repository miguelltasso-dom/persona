import { describe, expect, it } from 'vitest'
import { inferPersonaPaused } from '../src/client/profile/infer-persona-paused.ts'

describe('inferPersonaPaused', () => {
  it('detects host pause copy', () => {
    expect(inferPersonaPaused('offline', 'Offline')).toBe(true)
    expect(inferPersonaPaused('offline', 'Desconectada')).toBe(false)
  })
})
