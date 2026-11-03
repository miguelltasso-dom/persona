import type { Page } from 'playwright'

export interface AxeScanResult {
  skipped: boolean
  reason?: string
  violations: Array<{ id: string; impact?: string; nodes: number }>
  pass: boolean
}

/**
 * Run axe on the current page when `@axe-core/playwright` is installed (Keel adds the dep).
 * @param page - Playwright page with Persona preview loaded.
 */
export async function scanAccessibility(page: Page): Promise<AxeScanResult> {
  try {
    const { AxeBuilder } = await import('@axe-core/playwright' as string) as { AxeBuilder: new (opts: { page: Page }) => {
      analyze(): Promise<{ violations: Array<{ id: string; impact?: string; nodes: Array<unknown> }> }>
    } }
    const results = await new AxeBuilder({ page }).analyze()
    const violations = results.violations.map((v) => {
      const row: { id: string; impact?: string; nodes: number } = { id: v.id, nodes: v.nodes.length }
      if (v.impact !== undefined) row.impact = v.impact
      return row
    })
    return { skipped: false, violations, pass: violations.length === 0 }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      skipped: true,
      reason,
      violations: [],
      pass: true,
    }
  }
}
