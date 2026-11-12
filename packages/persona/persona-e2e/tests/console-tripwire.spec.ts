/**
 * The console tripwire and the reload: a poll in flight is ABORTED by the browser while the page unloads and the app logs it just before the frame navigates (`[persona] refresh falhou … Failed to fetch`).
 * That is the unload's doing, not the product's: the tripwire drops an aborted request that arrived in the last 1.5 s BEFORE a main-frame navigation — and nothing else. A page with a fake event surface, no browser.
 */
import { EventEmitter } from 'node:events'
import type { Page } from 'playwright'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertConsoleClean, UNLOAD_WINDOW_MS, watchConsole } from '../src/console-tripwire.ts'

const MAIN = { name: 'main' }
const CHILD = { name: 'child' }

function fakePage(): { readonly page: Page; readonly error: (text: string) => void; readonly navigate: (frame?: object) => void } {
  const events = new EventEmitter()
  const page = { on: (name: string, listener: (...args: unknown[]) => void) => events.on(name, listener), mainFrame: () => MAIN } as unknown as Page
  return {
    page,
    error: text => events.emit('console', { type: () => 'error', text: () => text }),
    navigate: (frame = MAIN) => events.emit('framenavigated', frame),
  }
}

const ABORT = '[persona] refresh falhou PersonaRemoteError: client api: persona/getOverviewNow failed: Failed to fetch'

describe('console tripwire x reload', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('an aborted request logged just BEFORE the main frame navigates is the unload\'s: it does not fail the scenario', () => {
    const { page, error, navigate } = fakePage()
    const tripwire = watchConsole(page)
    error(ABORT)
    vi.advanceTimersByTime(300)
    navigate()
    expect(tripwire.consoleErrors).toEqual([])
    expect(() => { assertConsoleClean(tripwire) }).not.toThrow()
  })

  it('the same error with NO navigation after it (a host that died) stays an error', () => {
    const { page, error } = fakePage()
    const tripwire = watchConsole(page)
    error(ABORT)
    expect(tripwire.consoleErrors).toEqual([ABORT])
    expect(() => { assertConsoleClean(tripwire) }).toThrow(/Failed to fetch/u)
  })

  it('an aborted request logged long BEFORE the navigation (> 1.5 s) is not the unload\'s: it stays', () => {
    const { page, error, navigate } = fakePage()
    const tripwire = watchConsole(page)
    error(ABORT)
    vi.advanceTimersByTime(UNLOAD_WINDOW_MS + 500)
    navigate()
    expect(tripwire.consoleErrors).toEqual([ABORT])
  })

  it('only fetch aborts are dropped: any other console error before a navigation stays, and a child-frame navigation drops nothing', () => {
    const { page, error, navigate } = fakePage()
    const tripwire = watchConsole(page)
    error('TypeError: x is not a function')
    error(ABORT)
    navigate(CHILD)
    expect(tripwire.consoleErrors).toEqual(['TypeError: x is not a function', ABORT])
    navigate()
    expect(tripwire.consoleErrors).toEqual(['TypeError: x is not a function'])
  })
})
