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

  it('movimento reduzido NÃO deixa o conteúdo em opacity 0: entra com um fade curto, sem deslocamento', () => {
    const { result } = renderHook(() => usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 10 }))
    expect(result.current.reducedMotion).toBe(true)
    // o estilo inline nunca esconde o conteúdo quando a aba está visível e o elemento está em vista
    expect(result.current.style.opacity).toBeUndefined()
    expect(result.current.style.transform).toBeUndefined()

    const node = document.createElement('div')
    const animate = vi.fn(() => ({ cancel: vi.fn() }))
    Object.defineProperty(node, 'animate', { value: animate })
    act(() => { result.current.ref(node) })
    expect(animate).toHaveBeenCalledTimes(1)
    const [keyframes, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(options.duration).toBe(120)
    expect(options.delay).toBe(0)
    expect(options.fill).toBe('both')
  })

  it('sem Web Animations (ou com ele indisponível) o conteúdo aparece no estado final, nunca preso em opacity 0', () => {
    const { result } = renderHook(() => usePersonaMotion({ fromOpacity: 0, fromTranslateY: 6 }))
    const node = document.createElement('div')
    act(() => { result.current.ref(node) })
    expect(node.style.opacity).toBe('')
    expect(node.style.transform).toBe('')
  })

  it('movimento normal continua com fade + deslocamento', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
    const { result } = renderHook(() => usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 10, delayMs: 80 }))
    const node = document.createElement('div')
    const animate = vi.fn(() => ({ cancel: vi.fn() }))
    Object.defineProperty(node, 'animate', { value: animate })
    act(() => { result.current.ref(node) })
    const [keyframes, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(10px)' })
    expect(options.delay).toBe(80)
  })
})
