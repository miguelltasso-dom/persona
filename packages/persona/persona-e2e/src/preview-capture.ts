import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { ARTIFACTS_DIR, PACKAGE_ROOT } from './paths.ts'

export const PREVIEW_PAGES_DIR = join(PACKAGE_ROOT, 'fixtures', 'preview-pages')

export const PREVIEW_TARGETS = [
  'prism-onboarding',
  'prism-persona-editor',
  'prism-hire-card',
  'lumen-kanban',
  'lumen-overview',
] as const

export type PreviewTargetId = typeof PREVIEW_TARGETS[number]

export interface CapturePreviewOptions {
  width?: number
  height?: number
  theme?: 'light' | 'dark'
}

/**
 * Screenshot static HTML preview fixtures (Prism/Lumen mock pages).
 * @param target - html file stem under fixtures/preview-pages.
 * @param options - viewport and theme.
 */
export async function capturePreviewPage(
  page: Page,
  target: PreviewTargetId,
  options: CapturePreviewOptions = {},
): Promise<string> {
  const width = options.width ?? 1280
  const height = options.height ?? 720
  await page.setViewportSize({ width, height })
  if (options.theme === 'dark') {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => { document.body.toggleAttribute('data-ds-dark-theme', true) })
  }
  const url = pathToFileURL(join(PREVIEW_PAGES_DIR, `${target}.html`)).href
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator('[data-persona-preview]').first().waitFor({ state: 'visible', timeout: 30_000 })
  const outDir = join(ARTIFACTS_DIR, 'previews')
  await mkdir(outDir, { recursive: true })
  const suffix = options.theme === 'dark' ? '-dark' : ''
  const path = join(outDir, `${target}${suffix}.png`)
  await page.screenshot({ path, animations: 'disabled', fullPage: false })
  return path
}

/**
 * Launch Chrome once for a batch of preview captures.
 * @param run - callback receiving a shared page.
 */
export async function withPreviewBrowser(run: (page: Page) => Promise<void>): Promise<void> {
  const browser: Browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  try {
    await run(page)
  } finally {
    await browser.close()
  }
}
