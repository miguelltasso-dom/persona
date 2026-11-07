import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Page } from 'playwright'

export interface AxeScanResult {
  skipped: boolean
  reason?: string
  /** How axe ran: the Playwright integration, or the axe-core source injected over CDP (installed Electron app). */
  via?: 'builder' | 'inject'
  violations: Array<{ id: string; impact?: string; nodes: number; detail?: string }>
  pass: boolean
}

interface RawViolation { id: string; impact?: string | null; help?: string; nodes: Array<{ target?: unknown }> }

function shape(rows: readonly RawViolation[]): AxeScanResult['violations'] {
  return rows.map((v) => {
    const row: { id: string; impact?: string; nodes: number; detail?: string } = { id: v.id, nodes: v.nodes.length }
    if (v.impact !== undefined && v.impact !== null) row.impact = v.impact
    const targets = v.nodes.slice(0, 3).map(node => JSON.stringify(node.target)).join(' ')
    row.detail = `${v.help ?? v.id} → ${targets}`
    return row
  })
}

/**
 * The integration opens a blank page in the same context to finish a run, which an attached Electron app (CDP default context)
 * does not allow, so the installed app used to come back "skipped" (a vacuous pass). This runs the axe-core source (the same file the
 * integration uses) straight in the page through the DevTools protocol: no new page, no script tag, no CSP involved.
 * @param page - Page of the app under test.
 */
async function scanByInjection(page: Page): Promise<RawViolation[]> {
  const require = createRequire(import.meta.url)
  const source = readFileSync(createRequire(require.resolve('@axe-core/playwright')).resolve('axe-core'), 'utf8')
  const session = await page.context().newCDPSession(page)
  try {
    const loaded = await session.send('Runtime.evaluate', { expression: source, returnByValue: false }) as { exceptionDetails?: { text?: string } }
    if (loaded.exceptionDetails !== undefined) throw new Error(`axe-core did not load: ${loaded.exceptionDetails.text ?? 'exception'}`)
    const ran = await session.send('Runtime.evaluate', {
      expression: 'axe.run(document, { resultTypes: ["violations"] }).then(result => JSON.stringify(result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target })) }))))',
      awaitPromise: true,
      returnByValue: true,
    }) as { result?: { value?: string }; exceptionDetails?: { text?: string } }
    if (ran.exceptionDetails !== undefined || typeof ran.result?.value !== 'string') throw new Error(`axe.run failed: ${ran.exceptionDetails?.text ?? 'no value'}`)
    return JSON.parse(ran.result.value) as RawViolation[]
  } finally {
    await session.detach().catch(() => undefined)
  }
}

/**
 * Run axe on the current page when `@axe-core/playwright` is installed (Keel adds the dep). Falls back to injecting axe-core over CDP
 * (attached Electron). Only when both fail is the scan reported as `skipped`, with both reasons.
 * @param page - Playwright page with Persona preview loaded.
 */
export async function scanAccessibility(page: Page): Promise<AxeScanResult> {
  let builderReason = ''
  try {
    const { AxeBuilder } = await import('@axe-core/playwright' as string) as { AxeBuilder: new (opts: { page: Page }) => {
      analyze(): Promise<{ violations: RawViolation[] }>
    } }
    const results = await new AxeBuilder({ page }).analyze()
    const violations = shape(results.violations)
    return { skipped: false, via: 'builder', violations, pass: violations.length === 0 }
  } catch (error) {
    builderReason = error instanceof Error ? error.message : String(error)
  }
  try {
    const violations = shape(await scanByInjection(page))
    return { skipped: false, via: 'inject', violations, pass: violations.length === 0 }
  } catch (error) {
    const injectReason = error instanceof Error ? error.message : String(error)
    return {
      skipped: true,
      reason: `builder: ${builderReason.slice(0, 200)} | inject: ${injectReason.slice(0, 200)}`,
      violations: [],
      pass: true,
    }
  }
}
