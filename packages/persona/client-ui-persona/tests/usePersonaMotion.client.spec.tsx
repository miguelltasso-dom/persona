// @vitest-environment jsdom
/** usePersonaMotion: reduced motion and visibility pause behavior. */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersonaMotion } from '../src/client/theme/usePersonaMotion.ts'

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  document.documentElement.style.setProperty('--motion-base', '220ms')
  document.documentElement.style.setProperty('--motion-reduced-fade', '120ms')
  document.documentElement.style.setProperty('--ease-enter', 'cubic-bezier(0,0,0.2,1)')
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePersonaMotion', () => {
  it('caps motion to a reduced fade duration in style', () => {
    const { result } = renderHook(() => usePersonaMotion({ preset: 'base' }))
    expect(result.current.reducedMotion).toBe(true)
    expect(result.current.style.transition).toContain('120')
  })

  it('pauses when the document becomes hidden', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    const { result } = renderHook(() => usePersonaMotion({ fromOpacity: 0.5 }))
    expect(result.current.paused).toBe(false)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.paused).toBe(true)
  })

  it('pauses when IntersectionObserver reports the element out of view', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    const { result } = renderHook(() => usePersonaMotion())
    const node = document.createElement('div')
    act(() => { result.current.ref(node) })
    const observer = MockIntersectionObserver.instances.at(-1)
    expect(observer).toBeDefined()
    act(() => {
      observer!.callback([{ isIntersecting: false } as IntersectionObserverEntry], observer as unknown as IntersectionObserver)
    })
    expect(result.current.paused).toBe(true)
  })
})
