/**
 * "Um dia da equipe" no APP REAL (Atlas D-090 (b): a prova para o Miguel é a CAPTURA do app real com esse dia, não o markdown).
 * O dia é o do host ({@link ./mandatory-team-day-host.spec.ts}, runner roteirizado, 0 IA): ele grava um PERSONA_HOME pronto em
 * `artifacts/gauge/team-day/home-seed` (banco + blobs). Aqui o host WEB REAL sobe nessa cópia (com `PERSONA_TEAMWORK=1`), o Chrome abre o
 * #geral com a flag `persona.flag.teamwork` e percorre o fio de cima a baixo: guarda o que a tela de fato escreve (texto de cada linha, lido do
 * DOM), as capturas em tema claro e escuro e o axe do #geral com o dia. Nenhuma chamada de IA (CLI falso no PATH, nada a rodar).
 * Rodar: PERSONA_E2E=1 sob `with-lock --lock build` (um host). Pré-requisito: rodar antes o spec do host do dia (grava o `home-seed`).
 * Saída: `artifacts/gauge/team-day-app/` (`tela.md`, `tela.json`, `dia-NN-claro.png`, `dia-NN-escuro.png`).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import { scanAccessibility } from '../src/axe-check.ts'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { assertConsoleClean, watchConsole, type ConsoleTripwire } from '../src/console-tripwire.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import { advisoryAxe, blockingAxe } from '../src/gauge-app.ts'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { startWebHost, type WebHostHandle } from '../src/web-host.ts'

const run = process.env.PERSONA_E2E === '1'
const SEED = join(ARTIFACTS_DIR, 'gauge', 'team-day', 'home-seed')
const OUT = join(ARTIFACTS_DIR, 'gauge', 'team-day-app')
// FLAGS-ON-1 (Keel 01:40): with `GAUGE_FLAGS_DEFAULT=1` the day opens EXACTLY as the person's app boots (no PERSONA_TEAMWORK, no localStorage flag).
const byHand = process.env.GAUGE_FLAGS_DEFAULT !== '1'
const seeded = existsSync(join(SEED, 'db', 'persona.db'))

interface ScreenRow { readonly id: string; readonly text: string; readonly step: number }

describe.skipIf(!run || !seeded)('Um dia da equipe no app real (host web real sobre o banco do dia, 0 IA)', () => {
  let host: WebHostHandle
  let home = ''
  let fakeCli: FakeCliPathScope
  let close: () => Promise<void> = async () => {}
  let page: Page
  let tripwire: ConsoleTripwire
  const rows: ScreenRow[] = []
  let screenText = ''
  const shots: string[] = []

  /** Which viewport sizes the pre-accept checks (Keel/Muse 03:27): 1440 and 960 as they are, and the 200 % zoom (640x360 CSS px). */
  const VIEWPORTS = [
    { tag: '1440x900', width: 1440, height: 900 },
    { tag: '960x640', width: 960, height: 640 },
    { tag: 'zoom200', width: 640, height: 360 },
  ] as const
  /** The scenes of the day, by WHAT is on screen (never by scroll step: the number of steps changes with the width). */
  const SCENES: readonly { readonly id: string; readonly find?: RegExp }[] = [
    { id: 'abertura' },
    { id: 'plano', find: /dividi assim/iu },
    { id: 'entrega', find: /revisado por/iu },
    { id: 'passagem', find: /passou para/iu },
    { id: 'ajuda', find: /pediu ajuda/iu },
    { id: 'opiniao', find: /quer a opini/iu },
    { id: 'bom-dia', find: /bom dia ·/iu },
    { id: 'proposta', find: /proposta de/iu },
    { id: 'cobranca', find: /espera a sua revis/iu },
  ]
  const missingScenes: string[] = []

  async function threadScroller(): Promise<import('playwright').JSHandle> {
    return page.evaluateHandle(() => {
      const first = document.querySelector('li[data-message-id]')
      let el: Element | null = first?.parentElement ?? null
      while (el !== null && el !== document.body) {
        const style = getComputedStyle(el)
        if (/(auto|scroll)/u.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el
        el = el.parentElement
      }
      return document.scrollingElement ?? document.documentElement
    })
  }

  /** Shoot every scene of the day in light and dark at 1440, 960 and 200 % zoom, each with the pre-accept probe next to the picture. */
  async function walkThread(): Promise<void> {
    const probe = await import(pathToFileURL(join(REPO_ROOT, 'scripts', 'persona', 'preaccept-probe.mjs')).href) as {
      collectProbe: (page: Page, options: { axePath?: string; consoleErrors?: string[]; focus?: boolean }) => Promise<unknown>
      writeProbe: (png: string, data: unknown) => void
    }
    const require = createRequire(import.meta.url)
    const axePath = createRequire(require.resolve('@axe-core/playwright')).resolve('axe-core')
    let errorMark = tripwire.consoleErrors.length
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.waitForTimeout(900)
      for (const scene of SCENES) {
        const scroller = await threadScroller()
        if (scene.find === undefined) await scroller.evaluate((el) => { (el as HTMLElement).scrollTop = 0 })
        else {
          const target = page.getByText(scene.find).first()
          if (await target.count() === 0) { if (!missingScenes.includes(scene.id)) missingScenes.push(scene.id) } else await target.evaluate((el) => { el.scrollIntoView({ block: 'center' }) })
        }
        await page.waitForTimeout(450)
        if (viewport.tag === '1440x900') {
          const found = await page.locator('li[data-message-id]').evaluateAll(items => items.map(item => ({ id: item.getAttribute('data-message-id') ?? '', text: (item as HTMLElement).innerText })))
          for (const row of found) if (!rows.some(known => known.id === row.id)) rows.push({ id: row.id, text: row.text.replace(/\s+/gu, ' ').trim(), step: SCENES.indexOf(scene) + 1 })
        }
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.waitForTimeout(300)
          const file = join(OUT, `${scene.id}-${scheme === 'light' ? 'claro' : 'escuro'}-${viewport.tag}.png`)
          await page.screenshot({ path: file })
          await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
          probe.writeProbe(file, await probe.collectProbe(page, { axePath, consoleErrors: tripwire.consoleErrors.slice(errorMark) }))
          errorMark = tripwire.consoleErrors.length
          shots.push(file)
        }
        await page.emulateMedia({ colorScheme: 'light' })
      }
      if (viewport.tag === '1440x900') {
        const scroller = await threadScroller()
        screenText = ((await scroller.evaluate(el => (el as HTMLElement).innerText)) as string).replace(/\n{2,}/gu, '\n').trim()
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  beforeAll(async () => {
    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(OUT, { recursive: true })
    home = mkdtempSync(join(tmpdir(), 'team-day-app-'))
    cpSync(SEED, home, { recursive: true }) // a copy: the seed stays untouched for the next run
    fakeCli = withFakeCliOnPath({})
    host = await startWebHost({ profile: 'persona', home, env: byHand ? { PERSONA_TEAMWORK: '1' } : { VITEST: '' } })
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ channel: 'chrome' })
    const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })
    await context.addInitScript((flagOn: boolean) => {
      try {
        if (flagOn) {
          for (const flag of ['teamwork', 'personaAsk', 'workingControl', 'houseDecor', 'taskProposal', 'lampLight', 'engineEffort', 'bubbles', 'settingsPersonas', 'figurinhas', 'navPlaces', 'nextStep']) localStorage.setItem(`persona.flag.${flag}`, '1')
          localStorage.setItem('persona.approvalsInbox.v2', '1')
        }
        localStorage.setItem('persona.onboarding.complete.v1', '1')
        // The app opens THE DAY's tenant (workspace ws / project pp / owner Ana / channel geral) instead of creating its own default one.
        localStorage.setItem('persona.tenant.v1', JSON.stringify({ workspaceId: 'ws', projectId: 'pp', memberId: 'ana', channelId: 'geral' }))
      } catch { /* storage blocked */ }
    }, byHand)
    page = await context.newPage()
    tripwire = watchConsole(page)
    close = async () => { await context.close(); await browser.close() }
    await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
    await dismissBlockingOverlays(page).catch(() => {})
    // The app boots on the day's tenant and already stands on #geral (Canais is the current place). Say what is on screen at the opening:
    // an overlay (scrim) that covers the rail is what a person sees first, so it is recorded, not hidden.
    await page.waitForTimeout(3_000)
    await page.screenshot({ path: join(OUT, 'abertura.png') }).catch(() => {})
    writeFileSync(join(OUT, 'abertura.txt'), (await page.locator('[class*="overlayLayer"]').first().innerText().catch(() => '(sem camada de sobreposição)')).slice(0, 2_000))
    if (await page.locator('li[data-message-id]').count() === 0) {
      await page.keyboard.press('Escape').catch(() => {})
      await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!).catch(() => {})
    }
    try {
      await page.locator('li[data-message-id]').first().waitFor({ state: 'visible', timeout: 60_000 })
    } catch (error) {
      // What the person would see instead of the day: a picture and the page text, so the failure explains itself.
      await page.screenshot({ path: join(OUT, 'sem-fio.png') }).catch(() => {})
      const text = await page.locator('body').innerText().catch(() => '')
      writeFileSync(join(OUT, 'sem-fio.txt'), `url: ${page.url()}

${text.slice(0, 4_000)}

console: ${tripwire.consoleErrors.join(' | ')}
pageErrors: ${tripwire.pageErrors.join(' | ')}
`)
      throw error
    }
    await page.waitForTimeout(2_000)
    const hint = page.getByRole('button', { name: 'Entendi' })
    if (await hint.count() > 0) await hint.first().click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(600)
    await walkThread()
    writeFileSync(join(OUT, 'tela.json'), JSON.stringify(rows, null, 2))
    writeFileSync(join(OUT, 'tela.md'), [
      '# Um dia da equipe — o que o app real ESCREVE na tela (#geral, texto lido do DOM, na ordem do fio)', '',
      `Host web real sobre o banco do dia (runner roteirizado, 0 IA), bundle servido, ${byHand ? 'flags da v1.1 ligadas À MÃO (PERSONA_TEAMWORK + localStorage)' : 'SEM NADA LIGADO À MÃO (padrão de fábrica do host e do cliente)'}. ${String(rows.length)} linhas; capturas: ${String(shots.length)} (${String(SCENES.length)} cenas × claro/escuro × 1440/960/200%).`, '',
      ...rows.map(row => `- (${String(row.step)}) ${row.text}`), '',
      '## Texto de toda a conversa, cartões incluídos (rolagem inteira do #geral)', '', screenText,
    ].join('\n'))
  }, 600_000)

  afterAll(async () => {
    await close()
    fakeCli?.restore()
    await host?.stop()
    if (home !== '') { try { rmSync(home, { recursive: true, force: true }) } catch { /* the OS temp folder is cleaned later; a locked copy must not fail the suite */ } }
  }, 60_000)

  vitestIt('[DIA-APP-1] o dia inteiro está no #geral do app real e lê como equipe: pedido, divisão, passagem, ajuda, opinião, conclusão, "Bom dia" e a proposta — sem id interno nem marcador cru', () => {
    const text = `${rows.map(row => row.text).join('\n')}\n${screenText}`
    expect(screenText.split('\n').length, 'linhas de texto do #geral (cartões incluídos)').toBeGreaterThan(40)
    expect(rows.length, 'mensagens (<li>) no fio').toBeGreaterThanOrEqual(3)
    expect(text, 'o pedido da pessoa').toMatch(/campanha de lançamento/u)
    expect(text, 'a Coordenação dividiu o pedido (cartão do plano)').toMatch(/dividi assim|dividi o pedido/iu)
    expect(text, 'a entrega do pedido (cartão) revisada pela Lia').toMatch(/Revisado por Lia/u)
    expect(text, 'a passagem de trabalho').toMatch(/Bia passou para Teo/u)
    expect(text, 'a ajuda').toMatch(/Teo pediu ajuda a Caio/u)
    expect(text, 'a conclusão do pedido').toMatch(/Concluído:|Pronto: Campanha de lançamento/u)
    expect(text, 'o "Bom dia"').toMatch(/bom dia/iu)
    expect(text, 'a proposta da persona travada').toMatch(/Posso destravar/u)
    expect(text, 'nenhum marcador cru nem id interno visível').not.toMatch(/\[\[|team:|routine:|assignment|bilhete/u)
  })

  vitestIt('[DIA-APP-1b cenas] cada cena do dia existe na tela (plano, entrega, passagem, ajuda, opinião, "Bom dia", proposta e cobrança) nos três tamanhos', () => {
    expect(missingScenes, 'cenas que não apareceram na tela').toEqual([])
  })

  vitestIt('[DIA-APP-2 R1 na tela] nenhuma Tarefa tem as DUAS linhas "Em andamento: X" e "Pronto: X" visíveis (o estado de cada Tarefa é um só, o cartão vivo do plano)', () => {
    const titles = rows.flatMap((row) => {
      const match = /(Em andamento|Esperando|Pronto):\s*(.+)$/u.exec(row.text)
      return match === null ? [] : [(match[2] ?? '').replace(/\s*\(.*$/u, '').trim()]
    })
    const repeated = [...new Set(titles.filter(title => titles.filter(other => other === title).length > 1))]
    expect(repeated, `Tarefas com mais de uma linha de estado na tela: ${repeated.join(' | ')}`).toEqual([])
  })

  vitestIt('[DIA-APP-3 a11y] o #geral com o dia não tem violação crítica nem séria de acessibilidade (axe real) nos dois temas (o cartão "Proposta de Teo" era um <div> dentro do <ol>; corrigido no bundle 3)', async () => {
    const found: string[] = []
    const advisory: string[] = []
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.waitForTimeout(400)
      const axe = await scanAccessibility(page)
      expect(axe.skipped, axe.reason ?? 'axe pulado').toBe(false)
      found.push(...blockingAxe(axe).map(line => `${scheme}: ${line}`))
      advisory.push(...advisoryAxe(axe).map(line => `${scheme}: ${line}`))
    }
    await page.emulateMedia({ colorScheme: 'light' })
    const notItems = await page.evaluate(() => [...document.querySelectorAll('ol, ul')].flatMap(list => [...list.children]
      .filter(child => !['LI', 'SCRIPT', 'TEMPLATE'].includes(child.tagName))
      .map(child => `${child.tagName.toLowerCase()}.${String(child.className).split(' ')[0] ?? ''} dentro de ${list.tagName.toLowerCase()}.${String(list.className).split(' ')[0] ?? ''}: ${((child as HTMLElement).innerText ?? '').replace(/\s+/gu, ' ').slice(0, 60)}`)))
    writeFileSync(join(OUT, 'axe.json'), JSON.stringify({ blocking: found, advisory, filhosQueNaoSaoLi: notItems }, null, 2))
    expect(found, `violações críticas/sérias; filhos que não são <li>: ${notItems.join(' | ')}`).toEqual([])
  }, 120_000)

  vitestIt.skipIf(byHand)('[DIA-APP-5 de fábrica] sem variável nem flag ligada à mão, o host sobe com a equipe, o fan-out, o início pelo quadro e as ferramentas LIGADOS (padrão de produção) — lido do próprio host (exportDiagnostics)', async () => {
    const answer = await page.evaluate(async () => {
      const body = { type: 'client-request', rpcId: `gauge-${String(Math.random()).slice(2)}`, method: 'persona/exportDiagnostics', payload: { args: {} } }
      const res = await fetch('/api/persona/exportDiagnostics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return await res.json() as { result?: { ok: boolean; value?: { json: string }; error?: { code?: string; message?: string } } }
    })
    if (answer.result?.ok !== true || answer.result.value === undefined) throw new Error(`exportDiagnostics: ${answer.result?.error?.code ?? 'sem resultado'} ${answer.result?.error?.message ?? ''}`)
    const out = answer.result.value
    const diagnostics = JSON.parse(out.json) as { flags?: Record<string, unknown>; lastErrors?: string[] }
    const flags = diagnostics.flags
    writeFileSync(join(OUT, 'flags-do-host.json'), JSON.stringify({ flags: flags ?? null, lastErrors: diagnostics.lastErrors ?? [] }, null, 2))
    expect((diagnostics.lastErrors ?? []).filter(line => /^(compile-context|boot-project)/u.test(line)), 'o host abriu o banco do dia sem erro de boot (subject-fold: forbidden é o caso tratado, Anvil 03:54: fica gravado, não reprova)').toEqual([])
    expect(flags, 'diagnóstico do host sem o campo flags').toBeDefined()
    expect(flags).toMatchObject({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
  })

  vitestIt('[DIA-APP-4 console] sem erro de página nem de console durante o dia', () => {
    assertConsoleClean(tripwire)
  })
})
