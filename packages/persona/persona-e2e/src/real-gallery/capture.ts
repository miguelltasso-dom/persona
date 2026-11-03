import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright'
import { E2E_TMP_ROOT, REPO_ROOT } from '../paths.ts'
import { startWebHost } from '../web-host.ts'
import { scanAccessibility, type AxeScanResult } from '../axe-check.ts'
import { onboarding } from '../real-app-locale.pt.ts'
import {
  GALLERY_THEMES,
  GALLERY_VIEWPORTS,
  ONBOARDING_STORAGE_KEY,
  REAL_GALLERY_PANELS,
  type GalleryPanelSpec,
} from './panels.ts'

export const REAL_GALLERY_DIR = join(REPO_ROOT, '.maestri', 'tmp', 'shots', 'real')

export interface GalleryCaptureRow {
  readonly panel: string
  readonly owner: string
  readonly theme: string
  readonly viewport: string
  readonly file: string
  readonly consoleErrors: string[]
  readonly axe: AxeScanResult
  readonly note?: string
}

async function navigatePanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  if (spec.kind === 'nav' || spec.kind === 'settings') {
    await page.getByRole('button', { name: spec.navLabel, exact: true }).click()
  }
  if (spec.slug === 'geral') {
    await page.getByPlaceholder('Mensagem para #geral…').waitFor({ state: 'visible', timeout: 60_000 })
  } else if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 60_000 })
  } else {
    await page.waitForTimeout(800)
  }
}

function formatAxe(axe: AxeScanResult): string {
  if (axe.skipped) return axe.reason ?? 'axe skipped'
  if (axe.violations.length === 0) return '0'
  return axe.violations.map(v => `${v.id}(${v.nodes})`).join(', ')
}

function buildIndexMarkdown(rows: readonly GalleryCaptureRow[]): string {
  const lines = [
    '# Persona real-app gallery',
    '',
    '| Painel | Dono | Arquivo | Console errors | Axe |',
    '|--------|------|---------|----------------|-----|',
  ]
  const byPanel = new Map<string, GalleryCaptureRow>()
  for (const row of rows) {
    const key = `${row.panel}-${row.theme}-${row.viewport}`
    byPanel.set(key, row)
  }
  for (const row of byPanel.values()) {
    const err = row.consoleErrors.length === 0 ? '0' : row.consoleErrors.length.toString()
    const note = row.note !== undefined ? ` _${row.note}_` : ''
    lines.push(`| ${row.panel}${note} | ${row.owner} | \`${row.file}\` | ${err} | ${formatAxe(row.axe)} |`)
  }
  lines.push('', `_Gerado ${new Date().toISOString()}_`, '')
  return lines.join('\n')
}

/**
 * Capture all real-app panels (web persona profile) into `.maestri/tmp/shots/real/`.
 */
export async function runRealGalleryCapture(): Promise<{ rows: GalleryCaptureRow[]; indexPath: string }> {
  process.env.PERSONA_HOST_NO_LOCK = '1'
  await mkdir(REAL_GALLERY_DIR, { recursive: true })
  const rows: GalleryCaptureRow[] = []
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })

  try {
    const host = await startWebHost({ profile: 'persona' })
    try {
      for (const viewport of GALLERY_VIEWPORTS) {
        for (const theme of GALLERY_THEMES) {
          const context = await browser.newContext({
            locale: 'pt-BR',
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: theme,
          })
          await context.addInitScript((key) => {
            localStorage.setItem(key, '1')
          }, ONBOARDING_STORAGE_KEY)
          const page = await context.newPage()
          const consoleErrors: string[] = []
          page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400))
          })

          await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
          await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
          await page.waitForTimeout(2_000)

          for (const spec of REAL_GALLERY_PANELS) {
            if (spec.kind === 'onboarding-step' || spec.kind === 'unmounted') continue
            const panelErrors: string[] = []
            page.removeAllListeners('console')
            page.on('console', (m) => {
              if (m.type() === 'error') panelErrors.push(m.text().slice(0, 400))
            })
            try {
              await navigatePanel(page, spec)
            } catch (error) {
              panelErrors.push(error instanceof Error ? error.message : String(error))
            }
            const file = `${spec.slug}-${theme}-${viewport.tag}.png`
            const path = join(REAL_GALLERY_DIR, file)
            await page.screenshot({ path, animations: 'disabled' })
            const axe = await scanAccessibility(page)
            rows.push({
              panel: spec.slug,
              owner: spec.owner,
              theme,
              viewport: viewport.tag,
              file,
              consoleErrors: [...panelErrors],
              axe,
            })
          }
          await context.close()
        }
      }
    } finally {
      await host.stop()
    }

    await captureOnboardingGallery(browser, rows)
  } finally {
    await browser.close()
  }

  const indexPath = join(REAL_GALLERY_DIR, 'index.md')
  await writeFile(indexPath, buildIndexMarkdown(rows), 'utf8')
  return { rows, indexPath }
}

async function captureOnboardingGallery(
  browser: Awaited<ReturnType<typeof import('playwright').chromium.launch>>,
  rows: GalleryCaptureRow[],
): Promise<void> {
  const onboardingHome = join(E2E_TMP_ROOT, `gallery-onboarding-${randomUUID()}`)
  const onboardingHost = await startWebHost({ profile: 'persona', home: onboardingHome })
  const continueExact = (page: Page) => page.getByRole('button', { name: onboarding.continue, exact: true })

  for (const viewport of GALLERY_VIEWPORTS) {
    for (const theme of GALLERY_THEMES) {
      const context = await browser.newContext({
        locale: 'pt-BR',
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      })
      const page = await context.newPage()
      const panelErrors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') panelErrors.push(m.text().slice(0, 400))
      })
      await page.goto(onboardingHost.url, { waitUntil: 'load', timeout: 120_000 })
      await page.getByRole('heading', { name: onboarding.step1Title }).waitFor({ state: 'visible', timeout: 180_000 })

      const steps = [1, 2, 3, 4, 5] as const
      for (const step of steps) {
        const file = `onboarding-passo-${String(step)}-${theme}-${viewport.tag}.png`
        await page.screenshot({ path: join(REAL_GALLERY_DIR, file), animations: 'disabled' })
        const axe = await scanAccessibility(page)
        rows.push({
          panel: `onboarding-passo-${String(step)}`,
          owner: 'Muse',
          theme,
          viewport: viewport.tag,
          file,
          consoleErrors: [...panelErrors],
          axe,
        })
        if (step === 1) {
          await page.getByPlaceholder(onboarding.step1Placeholder).fill('Galeria Probe')
          await continueExact(page).click()
        } else if (step === 2) {
          await page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…').fill('Contexto E2E.')
          await continueExact(page).click()
        } else if (step === 3) {
          await continueExact(page).click()
        } else if (step === 4) {
          await page.getByRole('button', { name: onboarding.step4TemplateBlank }).click()
          await continueExact(page).click()
        }
        if (step < 5) await page.waitForTimeout(400)
      }
      await context.close()
    }
  }
  await onboardingHost.stop()

  for (const viewport of GALLERY_VIEWPORTS) {
    for (const theme of GALLERY_THEMES) {
      rows.push({
        panel: 'editor-persona',
        owner: 'Prism',
        theme,
        viewport: viewport.tag,
        file: '(não montado no perfil persona — ver persona-editor-preview.client.spec.tsx)',
        consoleErrors: [],
        axe: { skipped: true, reason: 'surface not in B9 shell', violations: [], pass: true },
        note: 'Prism: wire PersonaEditor no shell',
      })
    }
  }
}
