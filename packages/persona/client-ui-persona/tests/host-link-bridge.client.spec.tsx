import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { bootHostLink, bootHostOrigin, connectHostLink, createStateLink, resetBootHostLinkForTests, useHostLink, type PersonaBootBridge } from '../src/client/boot/host-link-bridge.ts'

/**
 * boot-estatico: the bridge between `window.personaBoot` (the Rivet's phase 1: `onPhase` runs once with the CURRENT phase and then on every push; `subscribe` is failure-only) and the host link.
 */
interface FakeBridge extends PersonaBootBridge {
  phase(next: string, url?: string): void
  fail(message: string): void
  readonly offs: number[]
}

/** @param current - The phase `onPhase` reports on subscription. */
function fakeBridge(current: string, url?: string): FakeBridge {
  const phases = new Set<(phase: string, detail?: { readonly url?: string }) => void>()
  const failures = new Set<(detail: { readonly code: string; readonly message: string }) => void>()
  const offs: number[] = []
  return {
    offs,
    onPhase: (listener) => {
      phases.add(listener)
      listener(current, url === undefined ? undefined : { url }) // the listener runs ONCE on subscription with the current phase
      return () => { phases.delete(listener); offs.push(1) }
    },
    subscribe: (listener) => {
      failures.add(listener)
      return () => { failures.delete(listener); offs.push(2) }
    },
    phase: (next, nextUrl) => { for (const listener of [...phases]) listener(next, nextUrl === undefined ? undefined : { url: nextUrl }) },
    fail: (message) => { for (const listener of [...failures]) listener({ code: 'host-failed', message }) },
  }
}

afterEach(() => {
  resetBootHostLinkForTests()
  delete (globalThis as { personaBoot?: unknown }).personaBoot
})

describe('connectHostLink', () => {
  it('starting is waking; host-ready (with the host origin) is ready, and the origin is told before the link turns ready', () => {
    const bridge = fakeBridge('starting')
    const link = createStateLink()
    const order: string[] = []
    link.subscribe((state) => { order.push(`state:${state}`) })
    connectHostLink(link, bridge, (origin) => { order.push(`origin:${origin}`) })
    expect(link.state()).toBe('waking')
    bridge.phase('host-ready', 'http://127.0.0.1:54321')
    expect(link.state()).toBe('ready')
    expect(order).toEqual(['origin:http://127.0.0.1:54321', 'state:ready'])
  })

  it('a page opened when the host is already ready (the current phase on subscription) is ready at once', () => {
    const link = createStateLink()
    connectHostLink(link, fakeBridge('host-ready', 'http://127.0.0.1:1'))
    expect(link.state()).toBe('ready')
  })

  it('a failure pushed by subscribe is failed, with its message; "Tentar de novo" (starting again) goes back to waking and the next host-ready to ready', () => {
    const bridge = fakeBridge('starting')
    const link = createStateLink()
    connectHostLink(link, bridge)
    bridge.fail('o host saiu com código 1')
    expect(link.state()).toBe('failed')
    bridge.phase('starting')
    expect(link.state()).toBe('waking')
    bridge.phase('host-ready', 'http://127.0.0.1:2')
    expect(link.state()).toBe('ready')
  })

  it('a repeated starting while still waking changes nothing, and unsubscribing detaches both channels', () => {
    const bridge = fakeBridge('starting')
    const link = createStateLink()
    const off = connectHostLink(link, bridge)
    bridge.phase('starting')
    expect(link.state()).toBe('waking')
    off()
    expect(bridge.offs.sort()).toEqual([1, 2])
    bridge.phase('host-ready')
    expect(link.state()).toBe('waking')
  })
})

describe('the page link', () => {
  it('outside the Desktop (no bridge) it is ready from the start: nothing waits', () => {
    expect(bootHostLink().state()).toBe('ready')
    expect(bootHostOrigin()).toBeUndefined()
  })

  it('in the Desktop it follows window.personaBoot and remembers the host origin', () => {
    const bridge = fakeBridge('starting')
    ;(globalThis as { personaBoot?: PersonaBootBridge }).personaBoot = bridge
    expect(bootHostLink().state()).toBe('waking')
    expect(bootHostOrigin()).toBeUndefined()
    bridge.phase('host-ready', 'http://127.0.0.1:54321')
    expect(bootHostLink().state()).toBe('ready')
    expect(bootHostOrigin()).toBe('http://127.0.0.1:54321')
  })
})

describe('useHostLink', () => {
  it('renders the state of the link it is given', () => {
    const link = createStateLink()
    const Probe = (): ReturnType<typeof createElement> => createElement('span', null, useHostLink(link))
    expect(renderToString(createElement(Probe))).toContain('waking')
    link.markReady()
    expect(renderToString(createElement(Probe))).toContain('ready')
    const other = createStateLink()
    other.markFailed('x')
    const Failed = (): ReturnType<typeof createElement> => createElement('span', null, useHostLink(other))
    expect(renderToString(createElement(Failed))).toContain('failed')
  })
})
