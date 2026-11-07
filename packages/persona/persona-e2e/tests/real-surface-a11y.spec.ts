/**
 * F5 — WCAG axe + keyboard on EVERY real Persona surface (Keel item 2, Gauge).
 * Axe really runs now (`@axe-core/playwright` is installed; `skipped` is a FAILURE here, not a pass).
 * Gate: zero critical/serious per surface, an identity-based Tab traversal (no focus trap, no dead end), no console fatals.
 * Moderate best-practice findings (heading-order, page-has-heading-one…) are tracked in one bug test and written to
 * artifacts/gauge/axe/matrix.md. Host: own (home temp + free port, build lock) or `GAUGE_HOST_URL` for development.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import { scanAccessibility, type AxeScanResult } from '../src/axe-check.ts'
import { advisoryAxe, blockingAxe, captureDir, mainText, openGaugeSession, panelHealth, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'
import { probeKeyboardTraversal } from '../src/real-gallery/keyboard.ts'
import { resetGalleryHome } from '../src/real-gallery/navigate-panel.ts'
import { realGalleryHealthPanelSpecs } from '../src/real-gallery/panels.ts'
import { openRealPersonaApp } from '../src/real-app-session.ts'

const runA11y = process.env.PERSONA_A11Y === '1' || process.env.PERSONA_E2E === '1'
const SUITE = 'f5'

/** Known product bug: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 180_000): void {
  // GAUGE_BUGS_AS_TESTS=1: o bug roda como teste NORMAL (passou = consertado; falhou = aberto, com a mensagem do que a tela fez).

  if (process.env.GAUGE_BUGS_AS_TESTS === '1') vitestIt(`[BUG→${owner}] ${title}`, fn, timeout)

  else vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

/** Panels with a known critical/serious axe finding (owner). Remove from the map the moment the owner fixes it. */
const KNOWN_BLOCKERS: Readonly<Record<string, string>> = {
  // Configurações saiu da lista em 07/11: o job do bundle 3 (05/11 03:25) deu "Expect test to fail" (contraste do Prism corrigido).
}

describe.skipIf(!runA11y)('F5 — axe + teclado em todas as telas reais', () => {
  let s: GaugeSession
  const matrix: Array<{ slug: string; blocking: string[]; advisory: string[]; keyboard: boolean; kbWhy: string }> = []

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    const dir = await captureDir('axe')
    await writeFile(join(dir, 'matrix.json'), JSON.stringify(matrix, null, 2), 'utf8')
    const lines = ['# F5 — matriz axe + teclado (app real)', '', '| Tela | Bloqueantes (crítico/sério) | Moderados | Teclado |', '|---|---|---|---|']
    for (const row of matrix) {
      lines.push(`| ${row.slug} | ${row.blocking.length === 0 ? '0' : row.blocking.map(item => item.split(':')[0]).join(', ')} | ${row.advisory.length === 0 ? '0' : row.advisory.map(item => item.split('[')[0]).join(', ')} | ${row.keyboard ? 'ok' : `FALHA: ${row.kbWhy}`} |`)
    }
    await writeFile(join(dir, 'matrix.md'), `${lines.join('\n')}\n`, 'utf8')
    await s?.close()
  }, 120_000)

  for (const spec of realGalleryHealthPanelSpecs()) {
    const owner = KNOWN_BLOCKERS[spec.slug]
    const title = `[F5] ${spec.slug}: axe sem crítico/sério + Tab percorre sem armadilha de foco + sem fatais de console`
    const body = async (): Promise<void> => {
      const health = await panelHealth(s, spec.slug)
      expect(health.axe.skipped, `axe não rodou em ${spec.slug}: ${health.axe.reason ?? ''}`).toBe(false)
      const kb = await probeKeyboardTraversal(s.page, 16)
      matrix.push({ slug: spec.slug, blocking: blockingAxe(health.axe), advisory: advisoryAxe(health.axe), keyboard: kb.pass, kbWhy: kb.reason ?? '' })
      expect(health.fatals, `${spec.slug} fatais de console`).toEqual([])
      expect(health.blank, `${spec.slug} em branco: ${health.detail}`).toBe(false)
      expect(kb.pass, `${spec.slug}: ${kb.reason ?? kb.focusTags.join(' → ')}`).toBe(true)
      expect(blockingAxe(health.axe).join(' || '), `${spec.slug} axe crítico/sério`).toBe('')
    }
    if (owner === undefined) vitestIt(title, body, 180_000)
    else bug(owner, title, body)
  }

  bug('Lumen+Prism', '[F5] nenhuma tela tem violação moderada de axe (heading-order: h3 logo após h1 etc.; page-has-heading-one nas DMs) — ver artifacts/gauge/axe/matrix.md', async () => {
    const offenders = matrix.filter(row => row.advisory.length > 0).map(row => `${row.slug}: ${row.advisory.map(item => item.split('[')[0]).join(',')}`)
    expect(offenders.join(' | ')).toBe('')
  })

  vitestIt('[F5] editor de persona ("Nova persona"): axe sem crítico/sério, Tab sem armadilha, captura claro/escuro', async () => {
    await resetGalleryHome(s.page)
    await s.page.getByRole('button', { name: 'Contratar persona' }).click()
    await s.page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'visible', timeout: 30_000 })
    await s.page.getByRole('button', { name: 'Pular assistente' }).click()
    await s.page.getByRole('heading', { name: 'Nova persona' }).waitFor({ state: 'visible', timeout: 30_000 })
    const axe: AxeScanResult = await scanAccessibility(s.page)
    expect(axe.skipped, axe.reason ?? '').toBe(false)
    expect(blockingAxe(axe).join(' || '), 'editor: axe crítico/sério').toBe('')
    const kb = await probeKeyboardTraversal(s.page, 20)
    expect(kb.pass, kb.reason ?? kb.focusTags.join(' → ')).toBe(true)
    const unlabeled = await s.page.locator('main input:visible, main textarea:visible, [data-persona-surface] input:visible, [data-persona-surface] textarea:visible').evaluateAll(els => els.filter((el) => {
      const input = el as HTMLInputElement
      return !(input.labels?.length ?? 0) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('placeholder')
    }).map(el => el.outerHTML.slice(0, 100)))
    expect(unlabeled, 'campos do editor sem rótulo acessível').toEqual([])
    await shootBothThemes(s.page, SUITE, 'f5-editor-persona')
    await s.page.getByRole('button', { name: 'Visão geral', exact: true }).first().click()
  }, 240_000)

  vitestIt('[F5] todas as telas do menu abrem com conteúdo (nenhuma em branco)', async () => {
    const failures: string[] = []
    for (const spec of realGalleryHealthPanelSpecs().filter(item => item.kind === 'nav' && item.slug !== 'busca')) {
      const health = await panelHealth(s, spec.slug)
      const text = await mainText(s.page)
      if (health.blank || text.trim().length < 20) failures.push(spec.slug)
    }
    expect(failures, 'telas do menu que abriram em branco').toEqual([])
  }, 600_000)
})

describe.skipIf(!runA11y || (process.env.GAUGE_HOST_URL ?? '') !== '')('F5 — onboarding (5 passos): foco preso no modal e Esc seguro', () => {
  vitestIt('[F5] em cada passo o Tab fica DENTRO do onboarding (foco preso) e Esc não derruba nem perde o fluxo', async () => {
    const session = await openRealPersonaApp({ keepOnboarding: true, viewport: { width: 1280, height: 800 } })
    const dir = await captureDir(SUITE)
    await mkdir(dir, { recursive: true })
    try {
      const { page } = session
      const insideOverlay = async (): Promise<boolean> => await page.evaluate(() => {
        const el = document.activeElement
        if (el === null || el === document.body) return false
        return el.closest('[role="dialog"], [data-persona-onboarding], [aria-modal="true"]') !== null
      })
      const stray: string[] = []
      for (let step = 1; step <= 5; step += 1) {
        await page.waitForTimeout(600)
        for (let i = 0; i < 14; i += 1) {
          await page.keyboard.press('Tab')
          if (!(await insideOverlay())) stray.push(`passo ${String(step)} tab ${String(i + 1)}`)
        }
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
        expect(await page.locator('[data-persona-shell]').isVisible(), `passo ${String(step)}: Esc derrubou o shell`).toBe(true)
        await page.screenshot({ path: join(dir, `f5-onboarding-passo${String(step)}.png`) })
        const next = page.getByRole('button', { name: /^(Continuar|Pedir agora|Entrar na Persona|Entrar sem pedir agora)/u }).first()
        if (await next.count() === 0) break
        if (step === 1) await page.getByPlaceholder(/nome|chamar/iu).first().fill('Gauge F5').catch(() => {})
        await next.click().catch(() => {})
      }
      expect(stray, 'o foco saiu do onboarding').toEqual([])
    } finally {
      await session.close()
    }
  }, 420_000)
})
