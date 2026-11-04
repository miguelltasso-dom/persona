#!/usr/bin/env node
/**
 * Isolated splash / boot-error screenshots for Muse (DESKTOP-CHROME §4).
 * Writes PNGs under persona-spec/design/shots/. Needs Playwright Chromium.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootErrorHtml, bootSplashHtml } from '../src/reconnecting-page.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../persona-spec/design/shots')
mkdirSync(root, { recursive: true })

const pages = [
  { name: 'desktop-splash-light', html: bootSplashHtml('Acordando a equipe…', 'pt-BR'), colorScheme: 'light' },
  { name: 'desktop-splash-dark', html: bootSplashHtml('Acordando a equipe…', 'pt-BR'), colorScheme: 'dark' },
  { name: 'desktop-boot-error', html: bootErrorHtml({
    message: 'O aplicativo não pôde ser iniciado ou parou inesperadamente.',
    retry: 'Tentar de novo',
    copy: 'Copiar diagnóstico',
  }), colorScheme: 'light' },
]

const playwright = await import('playwright').catch(() => undefined)
if (playwright === undefined) {
  for (const page of pages) writeFileSync(join(root, `${page.name}.html`), page.html)
  console.log('playwright missing; wrote HTML only', root)
  process.exit(0)
}

const browser = await playwright.chromium.launch()
try {
  for (const spec of pages) {
    const context = await browser.newContext({
      viewport: { width: 960, height: 640 },
      colorScheme: spec.colorScheme,
      reducedMotion: spec.name.includes('dark') ? 'reduce' : 'no-preference',
    })
    const page = await context.newPage()
    await page.setContent(spec.html, { waitUntil: 'domcontentloaded' })
    await page.screenshot({ path: join(root, `${spec.name}.png`), type: 'png' })
    await context.close()
    console.log('wrote', spec.name)
  }
} finally {
  await browser.close()
}
