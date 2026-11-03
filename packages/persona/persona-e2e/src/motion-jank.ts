import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Page } from 'playwright'
import { PREVIEW_PAGES_DIR } from './preview-capture.ts'

export interface ReducedMotionCheck {
  reducedMedia: boolean
  transitionDurationMs: number
  pass: boolean
}

export interface JankCheck {
  longTaskCount: number
  maxLongTaskMs: number
  pass: boolean
}

/**
 * Verify preview motion probe honors prefers-reduced-motion (≤120ms transition).
 * @param page - Playwright page.
 */
/**
 * On a live Persona page, honor prefers-reduced-motion (sidebar indicator transition ≤120ms).
 * @param page - loaded Persona shell.
 */
export async function checkReducedMotionOnPersonaPage(page: Page): Promise<ReducedMotionCheck> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible' })
  const transitionDurationMs = await page.locator('[data-persona-shell]').evaluate((root) => {
    const el = root.querySelector('[class*="activeIndicator"], [class*="ActiveIndicator"]')
    const target = el ?? root
    const style = getComputedStyle(target)
    const raw = style.transitionDuration.split(',')[0]?.trim() ?? '0s'
    return raw.endsWith('ms') ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000
  })
  const reducedMedia = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const pass = reducedMedia && (transitionDurationMs <= 120 || Number.isNaN(transitionDurationMs))
  return { reducedMedia, transitionDurationMs, pass }
}

export async function checkReducedMotion(page: Page): Promise<ReducedMotionCheck> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const url = pathToFileURL(join(PREVIEW_PAGES_DIR, 'motion-probe.html')).href
  await page.goto(url, { waitUntil: 'networkidle' })
  const transitionDurationMs = await page.locator('#probe').evaluate((el) => {
    const style = getComputedStyle(el)
    const raw = style.transitionDuration.split(',')[0]?.trim() ?? '0s'
    return raw.endsWith('ms') ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000
  })
  const reducedMedia = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const pass = reducedMedia && transitionDurationMs <= 120
  return { reducedMedia, transitionDurationMs, pass }
}

/**
 * Short performance trace: fail when any long task exceeds 50ms.
 * @param page - Playwright page (any loaded Persona preview).
 */
export async function checkJank(page: Page, sampleMs = 1500): Promise<JankCheck> {
  await page.addInitScript(() => {
    (window as unknown as { __personaLongTasks: number[] }).__personaLongTasks = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          (window as unknown as { __personaLongTasks: number[] }).__personaLongTasks.push(entry.duration)
        }
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  })
  const fixture = readFileSync(join(PREVIEW_PAGES_DIR, 'prism-onboarding.html'), 'utf8')
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(sampleMs)
  const tasks = await page.evaluate(() => (
    window as unknown as { __personaLongTasks?: number[] }
  ).__personaLongTasks ?? [])
  const maxLongTaskMs = tasks.length === 0 ? 0 : Math.max(...tasks)
  return {
    longTaskCount: tasks.length,
    maxLongTaskMs,
    pass: maxLongTaskMs <= 50,
  }
}
