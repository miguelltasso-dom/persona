import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { ARTIFACTS_DIR, REPO_ROOT } from './paths.ts'
import { startWebHost } from './web-host.ts'
import { comparePngFiles } from './visual-diff/png-compare.ts'
import {
  assertBootstrapGateClean,
  runBootstrapGateChecks,
  type BootstrapGateResult,
} from './boot-gate-bootstrap.ts'

const ACTIVATION_WARNING = /web boot: warning:.*did not activate/i
const ONBOARDING_KEY = 'persona.onboarding.complete.v1'
const DEV_SEED_KEY = 'persona.devSeed.v1'
const REFERENCE = join(REPO_ROOT, 'persona-assets', 'references', 'dirD-tela.png')
const VIEWPORT = { width: 1440, height: 900 }

export interface PersonaBootGateResult {
  readonly lightScreenshot: string
  readonly darkScreenshot: string
  readonly consoleErrors: string[]
  readonly activationWarnings: string[]
  readonly hasPersonaShell: boolean
  readonly referenceDiffRatio?: number
  readonly referencePass?: boolean
  readonly bootstrap?: BootstrapGateResult
}

/**
 * Boot `--profile persona`, capture light/dark Chrome shots, and collect console failures.
 * Mirrors `scripts/persona/ui-boot-check.mjs` for vitest (Probe smoke-persona).
 */
export async function runPersonaUiBootGate(): Promise<PersonaBootGateResult> {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  const host = await startWebHost({ profile: 'persona' })
  const consoleErrors: string[] = []
  const activationWarnings: string[] = []
  const lightPath = join(ARTIFACTS_DIR, 'persona-light.png')
  const darkPath = join(ARTIFACTS_DIR, 'persona-dark.png')
  let hasPersonaShell = false
  let referenceDiffRatio: number | undefined
  let referencePass: boolean | undefined
  let bootstrap: BootstrapGateResult | undefined

  const browser: Browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: scheme,
        locale: 'pt-BR',
      })
      const page = await context.newPage()
      page.on('console', (message) => {
        const text = message.text()
        if (ACTIVATION_WARNING.test(text)) activationWarnings.push(`[${scheme}] ${text}`)
        if (message.type() === 'error') consoleErrors.push(`[${scheme}] ${text.slice(0, 500)}`)
      })
      page.on('pageerror', (error) => {
        consoleErrors.push(`[${scheme}] pageerror ${String(error).slice(0, 500)}`)
      })
      await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
      await page.waitForTimeout(6_000)
      await page.screenshot({
        path: scheme === 'light' ? lightPath : darkPath,
        animations: 'disabled',
      })
      if (scheme === 'light') {
        hasPersonaShell = await page.locator('[data-persona-shell]').count() > 0
        const harnessComposer = await page.locator('[data-composer-input]').count()
        if (harnessComposer > 0) {
          consoleErrors.push('[light] Harness ui-conversation composer mounted (expected Persona shell only)')
        }
      }
      await context.close()
    }

    if (existsSync(REFERENCE)) {
      const diffPage = await browser.newPage()
      try {
        const ref = await comparePngFiles(diffPage, lightPath, REFERENCE, {
          width: VIEWPORT.width,
          height: VIEWPORT.height,
          maxDiffRatio: hasPersonaShell ? 0.62 : 1,
        })
        referenceDiffRatio = ref.diffRatio
        referencePass = ref.pass
      } finally {
        await diffPage.close()
      }
    }

    const bootstrapErrors: string[] = []
    const bootCtx = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'light',
      locale: 'pt-BR',
    })
    const skipDevSeed = process.env.PERSONA_BOOT_NO_DEV_SEED === '1'
    await bootCtx.addInitScript(({ onboardingKey, devSeedKey, seed }: { onboardingKey: string; devSeedKey: string; seed: boolean }) => {
      localStorage.setItem(onboardingKey, '1')
      if (seed) localStorage.setItem(devSeedKey, '1')
    }, { onboardingKey: ONBOARDING_KEY, devSeedKey: DEV_SEED_KEY, seed: !skipDevSeed })
    const bootPage = await bootCtx.newPage()
    bootPage.on('pageerror', (error) => {
      bootstrapErrors.push(`pageerror ${String(error).slice(0, 500)}`)
    })
    bootPage.on('console', (message) => {
      if (message.type() === 'error') bootstrapErrors.push(`console.error ${message.text().slice(0, 500)}`)
    })
    await bootPage.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
    bootstrap = await runBootstrapGateChecks(bootPage, bootstrapErrors)
    await bootCtx.close()
  } finally {
    await browser.close()
    await host.stop()
  }

  const result: PersonaBootGateResult = {
    lightScreenshot: lightPath,
    darkScreenshot: darkPath,
    consoleErrors,
    activationWarnings,
    hasPersonaShell,
    ...(referenceDiffRatio !== undefined ? { referenceDiffRatio } : {}),
    ...(referencePass !== undefined ? { referencePass } : {}),
    ...(bootstrap !== undefined ? { bootstrap } : {}),
  }
  return result
}

/**
 * @param result - output from {@link runPersonaUiBootGate}.
 */
export function assertPersonaBootGateClean(result: PersonaBootGateResult): void {
  const parts: string[] = []
  if (result.activationWarnings.length > 0) {
    parts.push(`activation warnings:\n${result.activationWarnings.join('\n')}`)
  }
  if (result.consoleErrors.length > 0) {
    parts.push(`console errors:\n${result.consoleErrors.join('\n')}`)
  }
  if (result.bootstrap !== undefined) {
    try {
      assertBootstrapGateClean(result.bootstrap)
    } catch (error) {
      parts.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (parts.length > 0) throw new Error(parts.join('\n\n'))
}
