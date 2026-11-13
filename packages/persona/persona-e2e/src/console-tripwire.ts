import type { Page } from 'playwright'

/** Live console collectors; assert empty at scenario end (mirrors `apps/web/tests/scaffold.ts`). */
export interface ConsoleTripwire {
  readonly warnings: string[]
  readonly pageErrors: string[]
  readonly consoleErrors: string[]
}

/** A request the browser ABORTS while the page unloads (a reload or a navigation) fails with these words; it is what the unload does to a poll in flight, not a failure of the product. */
export const UNLOAD_ABORT = /Failed to fetch|NetworkError when attempting to fetch|Load failed|net::ERR_ABORTED/iu

/** How long before a main-frame navigation an aborted request is still the unload's doing. */
export const UNLOAD_WINDOW_MS = 1_500

/**
 * Attach console and pageerror listeners that fail the scenario when collected.
 * @param page - Playwright page under test.
 * @returns live collectors to assert empty at scenario end.
 */
export function watchConsole(page: Page): ConsoleTripwire {
  const warnings: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const stamps: number[] = [] // when each console error arrived (parallel to `consoleErrors`)
  page.on('console', (message) => {
    const text = message.text()
    const type = message.type()
    if (type === 'error') { consoleErrors.push(text); stamps.push(Date.now()) }
    if (/connection lost|gap repair|discontinuous|web boot: warning|did not activate/i.test(text)) warnings.push(text)
  })
  page.on('pageerror', (error) => { pageErrors.push(String(error)) })
  // A reload aborts the polls in flight and the app logs them just BEFORE the frame navigates: those, and only those (an aborted request in the last 1.5 s before a main-frame navigation), are the unload's,
  // not errors of the scenario. An aborted request at any other moment (a host that died, a refused call) stays an error.
  // `PERSONA_TRIPWIRE_STRICT=1` (diagnostic): NO filter at all, so a run proves the product itself no longer logs an aborted poll on reload (Prism's P3 fix), not that the harness hides it.
  if (process.env.PERSONA_TRIPWIRE_STRICT !== '1') {
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return
      const now = Date.now()
      for (let index = consoleErrors.length - 1; index >= 0; index -= 1) {
        if (now - (stamps[index] ?? 0) <= UNLOAD_WINDOW_MS && UNLOAD_ABORT.test(consoleErrors[index] ?? '')) { consoleErrors.splice(index, 1); stamps.splice(index, 1) }
      }
    })
  }
  return { warnings, pageErrors, consoleErrors }
}

/**
 * @param tripwire - collectors from {@link watchConsole}.
 */
export function assertConsoleClean(tripwire: ConsoleTripwire): void {
  const parts: string[] = []
  if (tripwire.pageErrors.length > 0) parts.push(`page errors:\n${tripwire.pageErrors.join('\n')}`)
  if (tripwire.consoleErrors.length > 0) parts.push(`console errors:\n${tripwire.consoleErrors.join('\n')}`)
  if (tripwire.warnings.length > 0) parts.push(`console warnings:\n${tripwire.warnings.join('\n')}`)
  if (parts.length > 0) throw new Error(parts.join('\n\n'))
}
