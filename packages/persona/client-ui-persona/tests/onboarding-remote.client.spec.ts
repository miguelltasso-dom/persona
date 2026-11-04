import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  overlayOpenFromHost,
  overlayOpenOptimisticInitial,
  shouldWriteCacheComplete,
} from '../src/client/remote/onboarding-host.ts'

afterEach(() => { vi.useRealTimers() })

describe('onboarding-host', () => {
  it('host firstUse controls overlay', () => {
    expect(overlayOpenFromHost(true)).toBe(true)
    expect(overlayOpenFromHost(false)).toBe(false)
  })

  it('optimistic initial paint respects cache only', () => {
    expect(overlayOpenOptimisticInitial(false)).toBe(true)
    expect(overlayOpenOptimisticInitial(true)).toBe(false)
  })

  it('writes cache when host says onboarding done', () => {
    expect(shouldWriteCacheComplete(true)).toBe(false)
    expect(shouldWriteCacheComplete(false)).toBe(true)
  })
})
