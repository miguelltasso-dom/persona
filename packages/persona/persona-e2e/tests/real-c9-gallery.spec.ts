/**
 * C9 — marco C (conversa, canais, DMs, Visão geral, quadros, arquivos, rotinas…) no APP REAL num home limpo:
 * galeria claro/escuro de todas as telas + fidelidade à direção D (`persona-assets/references/dirD-tela.png` + tokens do README).
 * Checks per screen: not blank / not stuck / no console fatals, screenshot not blank-sized, light ≠ dark.
 * Checks on design: rail ≈ #675290 and surface ≈ #FAF3E4 (light), dark really dark, dirD diff ratio ≤ 0.62 (same bar as the
 * preview-visual spec). Output: artifacts/gauge/c9/*.png + index.md. Host: own (build lock) or `GAUGE_HOST_URL`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, it as vitestIt } from 'vitest'
import { captureDir, openGaugeSession, panelHealth, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'
import { channelDistance, hexToRgb, luminance, meanColor } from '../src/gauge-visual.ts'
import { REPO_ROOT } from '../src/paths.ts'
import { comparePngFiles } from '../src/visual-diff/png-compare.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'c9'
const REFERENCE = join(REPO_ROOT, 'persona-assets', 'references', 'dirD-tela.png')
const SCREENS = ['visao-geral', 'geral', 'dms', 'kanban', 'arquivos', 'rotinas', 'aprovacoes', 'equipe', 'conhecimento', 'membros', 'uso', 'conexoes', 'configuracoes'] as const

describe.skipIf(!run)('C9 — galeria real claro/escuro vs direção D', () => {
  let s: GaugeSession
  const rows: string[] = []

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    const dir = await captureDir(SUITE)
    await writeFile(join(dir, 'index.md'), ['# C9 — galeria real (claro/escuro)', '', '| Tela | Claro (KB) | Escuro (KB) | Saúde |', '|---|---|---|---|', ...rows, ''].join('\n'), 'utf8')
    await s?.close()
  }, 60_000)

  /** Pairs of light/dark captures taken by the per-screen tests, compared in the dark-theme test below. */
  const pairs = new Map<string, readonly [string, string]>()
  const sizeKb = (file: string): number => Math.round(statSync(file).size / 1024)
  const hash = (file: string): string => createHash('sha1').update(readFileSync(file)).digest('hex')

  for (const slug of SCREENS) {
    it(`[C9] ${slug}: abre com conteúdo, sem fatais e as capturas claro/escuro não ficam vazias`, async () => {
      const health = await panelHealth(s, slug)
      const [light, dark] = await shootBothThemes(s.page, SUITE, `c9-${slug}`)
      pairs.set(slug, [light!, dark!])
      rows.push(`| ${slug} | ${String(sizeKb(light!))} | ${String(sizeKb(dark!))} | ${health.blank ? 'EM BRANCO' : health.stuck ? 'CARREGANDO PRESO' : health.fatals.length > 0 ? 'FATAIS' : 'ok'} |`)
      expect(health.fatals, `${slug} fatais de console`).toEqual([])
      expect(health.blank, `${slug}: ${health.detail}`).toBe(false)
      expect(health.stuck, `${slug}: ${health.detail}`).toBe(false)
      expect(sizeKb(light!), `${slug} claro (KB): captura quase vazia`).toBeGreaterThan(15)
      expect(sizeKb(dark!), `${slug} escuro (KB): captura quase vazia`).toBeGreaterThan(15)
    }, 180_000)
  }

  it('[C9] tokens da direção D no app (claro): trilho lilás #675290 e superfície creme #FAF3E4', async () => {
    await panelHealth(s, 'kanban')
    await s.page.emulateMedia({ colorScheme: 'light' })
    const dir = await captureDir(SUITE)
    const light = join(dir, 'c9-tokens-light.png')
    await s.page.screenshot({ path: light })
    const lightRail = await meanColor(s.page.context(), light, { x: 24, y: 650, width: 210, height: 70 })
    const lightSurface = await meanColor(s.page.context(), light, { x: 800, y: 450, width: 560, height: 380 })
    expect(channelDistance(lightRail, hexToRgb('#675290')), `trilho claro = ${JSON.stringify(lightRail)}`).toBeLessThanOrEqual(26)
    expect(channelDistance(lightSurface, hexToRgb('#FAF3E4')), `superfície clara = ${JSON.stringify(lightSurface)}`).toBeLessThanOrEqual(22)
  }, 120_000)

  vitestIt.fails('[BUG→Prism+Muse] [C9] com prefers-color-scheme: dark o tema ESCURO é de fato aplicado (body[data-ds-dark-theme="true"] — hoje installPersonaColorScheme grava "" e todo o CSS da Persona espera "true": o shell fica creme sob o corpo escuro)', async () => {
    await panelHealth(s, 'kanban')
    const dir = await captureDir(SUITE)
    await s.page.emulateMedia({ colorScheme: 'light' })
    await s.page.waitForTimeout(400)
    const light = join(dir, 'c9-dark-check-light.png')
    await s.page.screenshot({ path: light })
    await s.page.emulateMedia({ colorScheme: 'dark' })
    await s.page.waitForTimeout(700)
    const dark = join(dir, 'c9-dark-check-dark.png')
    await s.page.screenshot({ path: dark })
    await s.page.emulateMedia({ colorScheme: 'light' })
    // Contract (Prism/Keel): dark → body[data-ds-dark-theme]="true"; light → attribute ABSENT (host components match presence).
    await s.page.emulateMedia({ colorScheme: 'dark' })
    await s.page.waitForTimeout(400)
    const attr = await s.page.evaluate(() => document.body.getAttribute('data-ds-dark-theme'))
    await s.page.emulateMedia({ colorScheme: 'light' })
    await s.page.waitForTimeout(400)
    const lightHas = await s.page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))
    expect(lightHas, 'no claro o atributo data-ds-dark-theme deve estar AUSENTE').toBe(false)
    expect(attr, 'no escuro data-ds-dark-theme deve ser "true"').toBe('true')
    const surface = { x: 800, y: 450, width: 560, height: 380 }
    const lightSurface = await meanColor(s.page.context(), light, surface)
    const darkSurface = await meanColor(s.page.context(), dark, surface)
    expect(luminance(darkSurface), `superfície escura = ${JSON.stringify(darkSurface)} (data-ds-dark-theme="${String(attr)}")`).toBeLessThan(0.1)
    expect(luminance(lightSurface) - luminance(darkSurface), 'contraste entre temas').toBeGreaterThan(0.5)
  }, 120_000)

  vitestIt.fails('[BUG→Prism+Muse] [C9] em TODAS as telas a captura escura é diferente da clara (hoje sai idêntica: o tema escuro não é aplicado — mesma causa do teste acima)', () => {
    expect(pairs.size, 'as capturas por tela vêm dos testes [C9] acima').toBe(SCREENS.length)
    const same = [...pairs].filter(([, [light, dark]]) => hash(light) === hash(dark)).map(([slug]) => slug)
    expect(same, `telas com a captura escura IDÊNTICA à clara (${String(same.length)}/${String(pairs.size)})`).toEqual([])
  })

  it('[C9] Visão geral e #geral (claro, 1280×720) parecem a tela da direção D (diff ≤ 0,62, mesma barra do preview-visual) e o diff fica salvo', async () => {
    await s.page.setViewportSize({ width: 1280, height: 720 })
    try {
      for (const slug of ['visao-geral', 'geral'] as const) {
        await panelHealth(s, slug)
        await s.page.emulateMedia({ colorScheme: 'light' })
        const dir = await captureDir(SUITE)
        const actual = join(dir, `c9-dirD-${slug}-1280x720.png`)
        await s.page.screenshot({ path: actual })
        const scratch = await s.page.context().newPage()
        try {
          const cmp = await comparePngFiles(scratch, actual, REFERENCE, { width: 1280, height: 720, maxDiffRatio: 0.62 })
          rows.push(`| dirD diff ${slug} | ${cmp.diffRatio.toFixed(3)} | (limite 0,62) | ${cmp.pass ? 'ok' : 'ACIMA'} |`)
          expect(cmp.diffRatio, `${slug} vs dirD-tela.png`).toBeLessThanOrEqual(0.62)
        } finally {
          await scratch.close()
        }
      }
    } finally {
      await s.page.setViewportSize({ width: 1440, height: 900 })
    }
  }, 180_000)
})
