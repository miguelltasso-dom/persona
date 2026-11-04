/**
 * Boot-race reproducer (Muse P0): the CLIENT sometimes mounts an empty window — `SlotAssemblyError: renderSlot('root')
 * before any 'root' registration (boot order)` (packages/client/ui-renderer/src/client/scoped-slots.tsx). ~1 in 4 loads.
 * The race is in the browser, not the host, so ONE host + many reloads is enough. This spec:
 *   - reloads the Persona page N× in 960×640 light, 960×640 dark and 1440×900 light, plus M cold contexts;
 *   - every load must show `[data-persona-shell]` within 15 s and print no SlotAssemblyError / "before any 'root' registration"
 *     / pageerror;
 *   - on failure it names the 1-based index of every failing load (in the assertion message and in
 *     artifacts/gauge/boot-repeat/report.json) and keeps a screenshot of the first failure per config.
 * ~1–2 min. Host: its own (home temp + free port, under the `build` lock) or `GAUGE_HOST_URL` for development.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { startWebHost, type WebHostHandle } from '../src/web-host.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'

const run = process.env.PERSONA_E2E === '1'
const QUICK = process.env.GAUGE_BOOT_CONFIGS === 'quick'
const RELOADS = Number(process.env.GAUGE_BOOT_RELOADS ?? (QUICK ? '5' : '20'))
const COLD = Number(process.env.GAUGE_BOOT_COLD ?? (QUICK ? '0' : '6'))
const REBUILD = process.env.GAUGE_BOOT_REBUILD === '1'
const SHELL_MS = 15_000
const BAD = /SlotAssemblyError|before any 'root' registration|before any "root" registration|renderSlot\('root'\)/iu

interface LoadResult {
  readonly index: number
  readonly ok: boolean
  readonly ms: number
  readonly errors: readonly string[]
  /** What the person sees when the shell is missing (first 240 chars of body text; empty = blank window). */
  readonly seen?: string
}

interface ConfigReport {
  readonly config: string
  readonly kind: 'reload' | 'cold'
  readonly failures: readonly number[]
  readonly results: readonly LoadResult[]
}

interface BootConfig {
  readonly name: string
  readonly viewport: { width: number; height: number }
  readonly scheme: 'light' | 'dark'
  /** CDP CPU throttle (1 = none). A busy machine (parallel builds) is what makes the race show; this reproduces it on demand. */
  readonly cpu: number
  /** CDP: disable the HTTP cache so every reload re-fetches and re-evaluates the bundle (cold boot order). */
  readonly noCache: boolean
}

const ALL_CONFIGS: readonly BootConfig[] = [
  { name: '960x640-light', viewport: { width: 960, height: 640 }, scheme: 'light', cpu: 1, noCache: false },
  { name: '960x640-dark', viewport: { width: 960, height: 640 }, scheme: 'dark', cpu: 1, noCache: false },
  { name: '1440x900-light', viewport: { width: 1440, height: 900 }, scheme: 'light', cpu: 1, noCache: false },
  { name: '960x640-dark-cpu6x-nocache', viewport: { width: 960, height: 640 }, scheme: 'dark', cpu: 6, noCache: true },
  { name: '960x640-light-cpu4x-nocache', viewport: { width: 960, height: 640 }, scheme: 'light', cpu: 4, noCache: true },
]

const CONFIGS: readonly BootConfig[] = QUICK ? ALL_CONFIGS.filter(config => config.cpu === 1 && config.viewport.width === 960) : REBUILD ? [] : ALL_CONFIGS

describe.skipIf(!run)('boot repetido — o cliente sempre monta o shell (SlotAssemblyError "root")', () => {
  let url = ''
  let host: WebHostHandle | undefined
  let fake: FakeCliPathScope | undefined
  let browser: Browser
  const reports: ConfigReport[] = []

  beforeAll(async () => {
    const dev = process.env.GAUGE_HOST_URL
    if (dev !== undefined && dev !== '') {
      url = dev
    } else {
      fake = withFakeCliOnPath({ turnMs: 400 })
      host = await startWebHost({ profile: 'persona' })
      url = host.url
    }
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ channel: 'chrome' })
  }, 420_000)

  afterAll(async () => {
    const dir = join(ARTIFACTS_DIR, 'gauge', 'boot-repeat')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), url: url.replace(/token=.*/u, 'token=…'), reports }, null, 2), 'utf8')
    await browser?.close()
    fake?.restore()
    await host?.stop()
  }, 120_000)

  for (const config of CONFIGS) {
    it(`[boot] ${String(RELOADS)} recargas em ${config.name}: o shell aparece em ≤ 15 s e não há SlotAssemblyError`, async () => {
      const context = await browser.newContext({ locale: 'pt-BR', viewport: config.viewport, colorScheme: config.scheme })
      await context.addInitScript(() => { try { localStorage.setItem('persona.onboarding.complete.v1', '1') } catch { /* private mode */ } })
      const page = await context.newPage()
      if (config.cpu > 1 || config.noCache) {
        const cdp = await context.newCDPSession(page)
        if (config.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: config.cpu })
        if (config.noCache) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      }
      const errors: string[] = []
      page.on('pageerror', (error) => { errors.push(`pageerror: ${String(error)}`) })
      page.on('console', (message) => { if (message.type() === 'error' || BAD.test(message.text())) errors.push(`console.${message.type()}: ${message.text()}`) })
      const results: LoadResult[] = []
      const dir = join(ARTIFACTS_DIR, 'gauge', 'boot-repeat')
      await mkdir(dir, { recursive: true })
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
        for (let index = 1; index <= RELOADS; index += 1) {
          errors.length = 0
          const started = Date.now()
          if (index > 1) await page.reload({ waitUntil: 'load', timeout: 60_000 })
          let shell = true
          try {
            await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: SHELL_MS })
          } catch {
            shell = false
          }
          const bad = errors.filter(row => BAD.test(row))
          const ok = shell && bad.length === 0
          results.push({ index, ok, ms: Date.now() - started, errors: ok ? [] : (errors.length > 0 ? errors.slice(0, 4) : ['shell ausente em 15 s (janela vazia)']) })
          if (!ok && !results.slice(0, -1).some(row => !row.ok)) await page.screenshot({ path: join(dir, `FAILED-${config.name}-load${String(index)}.png`) }).catch(() => {})
        }
      } finally {
        await context.close()
      }
      const failures = results.filter(row => !row.ok).map(row => row.index)
      reports.push({ config: config.name, kind: 'reload', failures, results })
      expect(failures, `${config.name}: cargas que falharam (índice 1-based de ${String(RELOADS)}): ${JSON.stringify(results.filter(row => !row.ok).map(row => ({ i: row.index, e: row.errors[0] })))}`).toEqual([])
    }, 900_000)
  }

  it.skipIf(COLD === 0 || REBUILD)(`[boot] ${String(COLD)} aberturas a frio (contexto novo, cache vazio) em 960x640 escuro e claro`, async () => {
    const results: LoadResult[] = []
    const dir = join(ARTIFACTS_DIR, 'gauge', 'boot-repeat')
    await mkdir(dir, { recursive: true })
    for (let index = 1; index <= COLD; index += 1) {
      const scheme = index % 2 === 0 ? 'dark' as const : 'light' as const
      const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 960, height: 640 }, colorScheme: scheme })
      await context.addInitScript(() => { try { localStorage.setItem('persona.onboarding.complete.v1', '1') } catch { /* private mode */ } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => { errors.push(`pageerror: ${String(error)}`) })
      page.on('console', (message) => { if (message.type() === 'error' || BAD.test(message.text())) errors.push(`console.${message.type()}: ${message.text()}`) })
      const started = Date.now()
      let shell = true
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
        await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: SHELL_MS })
      } catch {
        shell = false
      }
      const bad = errors.filter(row => BAD.test(row))
      const ok = shell && bad.length === 0
      results.push({ index, ok, ms: Date.now() - started, errors: ok ? [] : (errors.slice(0, 4).length > 0 ? errors.slice(0, 4) : ['shell ausente em 15 s (janela vazia)']) })
      if (!ok) await page.screenshot({ path: join(dir, `FAILED-cold-${scheme}-load${String(index)}.png`) }).catch(() => {})
      await context.close()
    }
    const failures = results.filter(row => !row.ok).map(row => row.index)
    reports.push({ config: 'cold-960x640', kind: 'cold', failures, results })
    expect(failures, `a frio: cargas que falharam (índice 1-based de ${String(COLD)})`).toEqual([])
  }, 600_000)

  it.skipIf(!REBUILD)('[boot] recargas CONTÍNUAS enquanto o bundle do client é reescrito (hipótese: build concorrente no mesmo checkout)', async () => {
    const { spawn } = await import('node:child_process')
    const dir = join(ARTIFACTS_DIR, 'gauge', 'boot-repeat')
    await mkdir(dir, { recursive: true })
    const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 960, height: 640 }, colorScheme: 'dark' })
    await context.addInitScript(() => { try { localStorage.setItem('persona.onboarding.complete.v1', '1') } catch { /* private mode */ } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => { errors.push(`pageerror: ${String(error)}`) })
    page.on('console', (message) => { if (message.type() === 'error' || BAD.test(message.text())) errors.push(`console.${message.type()}: ${message.text()}`) })
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: SHELL_MS })
    let finished = false
    const bundle = spawn('pnpm', ['--filter', '@deepseek-ai/dsh-client-ui-persona', 'run', 'bundle'], { cwd: process.cwd(), shell: process.platform === 'win32', stdio: 'ignore' })
    const bundleStarted = Date.now()
    const exited = new Promise<number>((resolve) => { bundle.on('exit', (code) => { finished = true; resolve(code ?? -1) }) })
    const results: LoadResult[] = []
    let index = 0
    let after = 0
    while (!finished || after < 5) {
      if (finished) after += 1
      index += 1
      errors.length = 0
      const started = Date.now()
      let shell = true
      try {
        await page.reload({ waitUntil: 'load', timeout: 60_000 })
        await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: SHELL_MS })
      } catch {
        shell = false
      }
      const bad = errors.filter(row => BAD.test(row))
      const ok = shell && bad.length === 0
      const seen = ok ? undefined : (await page.locator('body').innerText().catch(() => '')).slice(0, 240)
      results.push({ index, ok, ms: Date.now() - started, errors: ok ? [] : errors.slice(0, 4), ...(seen === undefined ? {} : { seen }) })
      if (!ok && !results.slice(0, -1).some(row => !row.ok)) await page.screenshot({ path: join(dir, `FAILED-rebuild-load${String(index)}.png`) }).catch(() => {})
      if (index > 400) break
    }
    const code = await exited
    await context.close()
    const failures = results.filter(row => !row.ok).map(row => row.index)
    reports.push({ config: `rebuild(bundle ${String(Math.round((Date.now() - bundleStarted) / 1000))}s, exit ${String(code)})`, kind: 'reload', failures, results })
    expect(code, 'o bundle do client terminou com sucesso').toBe(0)
    expect(failures, `durante a reescrita do bundle: cargas que falharam (índice 1-based de ${String(results.length)}): ${JSON.stringify(results.filter(row => !row.ok).slice(0, 5).map(row => ({ i: row.index, seen: row.seen, e: row.errors[0] })))}`).toEqual([])
  }, 900_000)
})
