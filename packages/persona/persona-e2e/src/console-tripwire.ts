import type { Page } from 'playwright'

/** Live console collectors; assert empty at scenario end (mirrors `apps/web/tests/scaffold.ts`). */
export interface ConsoleTripwire {
  readonly warnings: string[]
  readonly pageErrors: string[]
  readonly consoleErrors: string[]
}

/**
 * Attach console and pageerror listeners that fail the scenario when collected.
 * @param page - Playwright page under test.
 * @returns live collectors to assert empty at scenario end.
 */
export function watchConsole(page: Page): ConsoleTripwire {
  const warnings: string[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    const type = message.type()
    if (type === 'error') consoleErrors.push(text)
    if (/connection lost|gap repair|discontinuous|web boot: warning/i.test(text)) warnings.push(text)
  })
  page.on('pageerror', (error) => { pageErrors.push(String(error)) })
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
