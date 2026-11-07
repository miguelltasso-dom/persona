import { describe, expect, it, vi } from 'vitest'
import { cachedNodeInternal } from '../src/profile-resolution/node-internals.ts'

const CACHE_KEY = Symbol.for('@deepseek-ai/dsh-app-boot.nodeInternals')

function reset(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[CACHE_KEY]
}

describe('cachedNodeInternal (P0-25: the packaged Host paid ~420 ms for every internal it asked for twice)', () => {
  it('asks the native loader once per id and returns the same object afterwards', () => {
    reset()
    const realm = { internalBinding: () => ({}) }
    const load = vi.fn((id: string) => (id === 'internal/bootstrap/realm' ? realm : { id }))
    expect(cachedNodeInternal('internal/bootstrap/realm', load)).toBe(realm)
    expect(cachedNodeInternal('internal/bootstrap/realm', load)).toBe(realm)
    expect(cachedNodeInternal('internal/modules/esm/loader', load)).toEqual({ id: 'internal/modules/esm/loader' })
    expect(cachedNodeInternal('internal/modules/esm/loader', load)).toEqual({ id: 'internal/modules/esm/loader' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failure or an empty answer: the next call tries again', () => {
    reset()
    let attempts = 0
    const flaky = (): unknown => {
      attempts += 1
      if (attempts === 1) throw new Error('addon not ready')
      return { ok: true }
    }
    expect(() => cachedNodeInternal('internal/modules/helpers', flaky)).toThrow('addon not ready')
    expect(cachedNodeInternal('internal/modules/helpers', flaky)).toEqual({ ok: true })
    expect(cachedNodeInternal('internal/modules/helpers', flaky)).toEqual({ ok: true })
    expect(attempts).toBe(2)
    const none = vi.fn(() => undefined)
    expect(cachedNodeInternal('internal/missing', none)).toBeUndefined()
    expect(cachedNodeInternal('internal/missing', none)).toBeUndefined()
    expect(none).toHaveBeenCalledTimes(2)
  })

  it('is shared by every copy of the module in the process (the resolver and dsh-hmr each import their own)', async () => {
    reset()
    const first = vi.fn(() => ({ shared: true }))
    const value = cachedNodeInternal('internal/modules/esm/resolve', first)
    vi.resetModules()
    const again = (await import('../src/profile-resolution/node-internals.ts')).cachedNodeInternal
    const second = vi.fn(() => ({ shared: false }))
    expect(again('internal/modules/esm/resolve', second)).toBe(value)
    expect(second).not.toHaveBeenCalled()
  })
})
