#!/usr/bin/env node
/** Dump installed Persona.exe CDP pages after attach (D8 diagnose). */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { startInstalledDesktop } from '../../packages/persona/persona-e2e/src/installed-desktop.ts'
import { ARTIFACTS_DIR } from '../../packages/persona/persona-e2e/src/paths.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? process.argv[2]
if (!exe) {
  process.stderr.write('Usage: installed-cdp-diag.mjs <Persona.exe>\n')
  process.exit(2)
}

await mkdir(ARTIFACTS_DIR, { recursive: true })
const desktop = await startInstalledDesktop({ exe, keepRunRoot: true })
const waitMs = Number(process.env.PERSONA_DIAG_WAIT_MS ?? '45000')
const consoleLines = []
const exceptions = []
desktop.page.on('console', (msg) => {
  consoleLines.push(`${msg.type()}: ${msg.text()}`)
})
desktop.page.on('pageerror', (error) => {
  consoleLines.push(`pageerror: ${error.message}`)
})
const cdp = await desktop.page.context().newCDPSession(desktop.page)
await cdp.send('Runtime.enable')
cdp.on('Runtime.exceptionThrown', (event) => {
  const detail = event.exceptionDetails
  exceptions.push((detail?.text ?? detail?.exception?.description ?? 'exception').slice(0, 240))
})
await desktop.page.evaluate(() => {
  const store = globalThis
  store.__personaCspViolations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    store.__personaCspViolations.push({
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
    })
  })
}).catch(() => {})
try {
  await new Promise((done) => { setTimeout(done, waitMs) })
  const pages = []
  for (const context of desktop.page.context().browser()?.contexts() ?? []) {
    for (const candidate of context.pages()) {
      const html = await candidate.content().catch(() => '')
      pages.push({
        url: candidate.url(),
        title: await candidate.title().catch(() => ''),
        htmlHead: html.slice(0, 2500),
        shell: await candidate.locator('[data-persona-shell]').count().catch(() => -1),
        bodyText: await candidate.locator('body').innerText().catch(() => '').then((t) => t.slice(0, 800)),
      })
    }
  }
  const boot = await desktop.page.evaluate(async () => {
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const bootGraph = globalThis.__DSH_BOOT__
    const entries = bootGraph && typeof bootGraph === 'object' && Array.isArray(bootGraph.entries)
      ? bootGraph.entries.map((entry) => ({
        id: entry?.id,
        url: typeof entry?.url === 'string' ? entry.url.slice(0, 160) : undefined,
      }))
      : []
    const desktopBoot = globalThis.dshDesktopBoot
    let injections = null
    if (desktopBoot && typeof desktopBoot.ready === 'function') {
      try {
        const payload = await desktopBoot.ready()
        const rows = Array.isArray(payload?.injections) ? payload.injections : []
        injections = {
          streamBaseUrl: payload?.streamBaseUrl ?? null,
          count: rows.length,
          kinds: rows.map((row) => row?.kind).slice(0, 20),
          scriptSrcs: rows
            .filter((row) => row?.kind === 'script-src')
            .map((row) => String(row.src ?? '').slice(0, 160)),
          scriptTexts: rows
            .filter((row) => row?.kind === 'script')
            .map((row) => String(row.text ?? '').slice(0, 80)),
        }
      } catch (error) {
        injections = { error: String(error) }
      }
    }
    return {
      appleTitle: meta?.getAttribute('content') ?? null,
      hasPersonaShell: Boolean(document.querySelector('[data-persona-shell]')),
      rootChildCount: document.querySelector('#root')?.childElementCount ?? -1,
      bootReady: Boolean(globalThis.__DSH_BOOT_READY__),
      moduleLoader: typeof globalThis.__ModuleLoader__,
      transport: globalThis.__DSH_TRANSPORT__ ?? null,
      cspViolations: globalThis.__personaCspViolations ?? [],
      readyScript: Boolean(document.querySelector('script[src="/__persona-boot__/ready.js"]')),
      bootEntryCount: entries.length,
      bootHasPersonaUi: entries.some((entry) => String(entry.id ?? '').includes('client-ui-persona')),
      bootIds: entries.map((entry) => entry.id).filter(Boolean).slice(0, 40),
      injections,
    }
  }).catch((error) => ({ error: String(error) }))
  const { readFileSync, existsSync } = await import('node:fs')
  const profileFacts = {}
  for (const name of ['desktop', 'persona']) {
    const manifest = join(desktop.home, 'profiles', name, 'package.json')
    if (!existsSync(manifest)) {
      profileFacts[name] = null
      continue
    }
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    profileFacts[name] = {
      bundles: parsed.dsh?.profile?.bundles ?? [],
      files: existsSync(join(desktop.home, 'profiles', name, 'cordis.patch.yml')),
    }
  }
  const shot = join(ARTIFACTS_DIR, 'installed-cdp-diag.png')
  await desktop.page.screenshot({ path: shot, animations: 'disabled' }).catch(() => {})
  const report = {
    exe: desktop.exe,
    home: desktop.home,
    userData: desktop.userData,
    rendererPort: desktop.rendererPort,
    pageUrl: desktop.page.url(),
    shot,
    boot,
    profileFacts,
    exceptions: exceptions.slice(0, 20),
    consoleLines: consoleLines.slice(0, 80),
    pages,
  }
  const jsonPath = join(ARTIFACTS_DIR, 'installed-cdp-diag.json')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  await desktop.stop()
}
