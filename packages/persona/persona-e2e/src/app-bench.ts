import type { Page } from 'playwright'
import { startWebHost } from './web-host.ts'

export interface ShellReadySample {
  readonly coldMs: number
  readonly warmMs: number
}

/**
 * Time until `[data-persona-shell]` visible (cold = new context, warm = reload).
 */
export async function measureWebShellReady(page: Page, url: string): Promise<ShellReadySample> {
  const coldStart = performance.now()
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  const coldMs = performance.now() - coldStart

  const warmStart = performance.now()
  await page.reload({ waitUntil: 'load' })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  const warmMs = performance.now() - warmStart

  return { coldMs, warmMs }
}

/**
 * Boot persona web host and measure shell-ready (Probe bench item 3).
 */
export async function runWebBootBench(): Promise<{ url: string; sample: ShellReadySample }> {
  const host = await startWebHost({ profile: 'persona' })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await browser.newPage()
    const sample = await measureWebShellReady(page, host.url)
    return { url: host.url, sample }
  } finally {
    await browser.close()
    await host.stop()
  }
}
