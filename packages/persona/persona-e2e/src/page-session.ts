import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type Page, type ViewportSize } from 'playwright'
import { ARTIFACTS_DIR } from './paths.ts'
import { assertConsoleClean, watchConsole, type ConsoleTripwire } from './console-tripwire.ts'

export interface ScreenshotOptions {
  theme: 'light' | 'dark'
  viewport?: ViewportSize
}

export interface PersonaPageSession {
  readonly page: Page
  readonly tripwire: ConsoleTripwire
  screenshot(name: string, options: ScreenshotOptions): Promise<string>
  ariaSnapshot(): Promise<string>
  assertConsoleClean(): void
  close(): Promise<void>
}

/**
 * Open the Harness web UI in Chrome and wait for the composer (Tier 1 browser session).
 * @param url - authenticated `dsh web` URL with token.
 */
export async function openPage(url: string): Promise<PersonaPageSession> {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  const browser: Browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext()
  const page = await context.newPage()
  const tripwire = watchConsole(page)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('[data-composer-input], [data-persona-shell]').first().waitFor({ state: 'visible', timeout: 240_000 })

  async function screenshot(name: string, options: ScreenshotOptions): Promise<string> {
    if (options.viewport !== undefined) await page.setViewportSize(options.viewport)
    await page.evaluate((dark) => {
      document.body.toggleAttribute('data-ds-dark-theme', dark)
    }, options.theme === 'dark')
    const base = name.endsWith('.png') ? name : `${name}.png`
    const path = join(ARTIFACTS_DIR, base)
    await page.screenshot({ path, animations: 'disabled' })
    return path
  }

  return {
    page,
    tripwire,
    screenshot,
    ariaSnapshot: () => page.locator('body').ariaSnapshot(),
    assertConsoleClean: () => { assertConsoleClean(tripwire) },
    close: async () => {
      await context.close()
      await browser.close()
    },
  }
}
