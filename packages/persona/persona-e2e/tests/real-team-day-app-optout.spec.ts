/**
 * Opt-out por flag no APP REAL com o dia da equipe (Gauge; LEAK-1 e o contrato do FLAGS-ON-1). No app do Miguel as flags do cliente nascem LIGADAS;
 * quem desliga uma (`localStorage persona.flag.<nome>` = '0', ou o seletor da Muse) tem de ler o MESMO dia sem marcador cru do host
 * (`[[task-proposal:{json}]]`, `[[handoff:…]]`…), sem id interno (`team:`, `routine:`), sem erro de console e com o fio inteiro (plano, passagens, opinião,
 * "Bom dia", proposta, cobrança). Uma flag desligada por vez (a tabela FLAGS do cliente, lida do código: flag nova entra na matriz sozinha), TODAS desligadas de
 * uma vez e a rodada de fábrica (nada gravado = o padrão de produção). Banco do dia gravado por {@link ./mandatory-team-day-host.spec.ts} (`home-seed`),
 * host web real SEM VITEST, 0 IA.
 * Rodar: PERSONA_E2E=1 sob `with-lock --lock build`. Saída: `artifacts/gauge/team-day-optout/` (`matriz.md`, `matriz.json`, 1 captura por leitura).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { watchConsole } from '../src/console-tripwire.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { startWebHost, type WebHostHandle } from '../src/web-host.ts'

const run = process.env.PERSONA_E2E === '1'
const SEED = join(ARTIFACTS_DIR, 'gauge', 'team-day', 'home-seed')
const OUT = join(ARTIFACTS_DIR, 'gauge', 'team-day-optout')
const seeded = existsSync(join(SEED, 'db', 'persona.db'))

interface FlagTable { readonly FLAGS: Readonly<Record<string, { readonly key: string; readonly defaultOn: boolean }>> }
interface Reading {
  readonly label: string
  readonly off: readonly string[]
  readonly shell: boolean
  readonly text: string
  readonly consoleProblems: readonly string[]
  readonly picture: string
}

/** What must never be on the person's screen: a host marker, an internal id or a leaked placeholder (same list the pre-accept probe rejects). */
const LEAKS = /\[\[|\]\]|\b(?:team|routine|assignment|coordination):[a-z0-9_-]+|\bundefined\b|\[object|\bbilhete\b/iu

describe.skipIf(!run || !seeded)('Opt-out por flag no app real com o dia da equipe (host web real sobre o banco do dia, 0 IA)', () => {
  let host: WebHostHandle
  let home = ''
  let fakeCli: FakeCliPathScope
  let browser: Browser
  let flags: FlagTable['FLAGS'] = {}
  const readings: Reading[] = []

  async function threadText(page: Page): Promise<string> {
    // The whole #geral is in the DOM (not virtualized): the scroller's innerText is the thread with its cards. Fall back to the body when the scroller is not found.
    const scroller = await page.evaluateHandle(() => {
      const first = document.querySelector('li[data-message-id]')
      let el: Element | null = first?.parentElement ?? null
      while (el !== null && el !== document.body) {
        const style = getComputedStyle(el)
        if (/(auto|scroll)/u.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el
        el = el.parentElement
      }
      return document.body
    })
    const text = await scroller.evaluate(el => (el as HTMLElement).innerText) as string
    return text.replace(/\n{2,}/gu, '\n').trim()
  }

  /** Opens the day's #geral exactly as the person does, with the given flags turned OFF ('0' in localStorage, the same switch the app reads). */
  async function readDay(label: string, off: readonly string[]): Promise<Reading> {
    const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })
    try {
      await context.addInitScript((keys: string[]) => {
        try {
          for (const key of keys) localStorage.setItem(key, '0')
          localStorage.setItem('persona.onboarding.complete.v1', '1')
          localStorage.setItem('persona.tenant.v1', JSON.stringify({ workspaceId: 'ws', projectId: 'pp', memberId: 'ana', channelId: 'geral' }))
        } catch { /* storage blocked */ }
      }, off.map(name => flags[name]?.key ?? name))
      const page = await context.newPage()
      const tripwire = watchConsole(page)
      await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
      const shell = await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 }).then(() => true, () => false)
      await dismissBlockingOverlays(page).catch(() => {})
      await page.waitForTimeout(2_500)
      if (shell && await page.locator('li[data-message-id]').count() === 0) {
        await page.keyboard.press('Escape').catch(() => {})
        await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!).catch(() => {})
      }
      if (shell) await page.locator('li[data-message-id]').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
      const hint = page.getByRole('button', { name: 'Entendi' })
      if (await hint.count() > 0) await hint.first().click({ timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(1_200)
      const text = shell ? await threadText(page) : await page.locator('body').innerText().catch(() => '')
      const picture = join(OUT, `${label}.png`)
      await page.screenshot({ path: picture }).catch(() => {})
      const consoleProblems = [...tripwire.pageErrors.map(line => `pageerror: ${line}`), ...tripwire.consoleErrors.map(line => `console: ${line}`)]
      const reading: Reading = { label, off, shell, text, consoleProblems, picture }
      readings.push(reading)
      return reading
    } finally {
      await context.close()
    }
  }

  /** The common contract of every reading: the shell opened, the day is there, nothing leaked, the console is clean. */
  function expectReadableDay(reading: Reading): void {
    expect(reading.shell, `${reading.label}: o shell do app não abriu`).toBe(true)
    expect(reading.text, `${reading.label}: o pedido da pessoa sumiu do fio`).toMatch(/campanha de lançamento/u)
    expect(reading.text, `${reading.label}: a proposta/o "Bom dia"/a cobrança sumiram do fio (o dia ficou curto)`).toMatch(/Posso destravar/u)
    expect(reading.text.split('\n').length, `${reading.label}: linhas de texto do #geral`).toBeGreaterThan(25)
    const leaked = LEAKS.exec(reading.text)
    expect(leaked === null ? '' : `"${leaked[0]}" em: …${reading.text.slice(Math.max(0, leaked.index - 60), leaked.index + 100).replace(/\n/gu, ' ⏎ ')}…`, `${reading.label}: marcador cru ou id interno na tela`).toBe('')
    expect(reading.consoleProblems, `${reading.label}: erro de página/console`).toEqual([])
  }

  beforeAll(async () => {
    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(OUT, { recursive: true })
    // The table of flags is read from the client code itself, so a flag added tomorrow enters the matrix without anyone editing this file.
    const table = await import(pathToFileURL(join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'src', 'client', 'flags.ts')).href) as FlagTable
    flags = table.FLAGS
    home = mkdtempSync(join(tmpdir(), 'team-day-optout-'))
    cpSync(SEED, home, { recursive: true }) // a copy: the seed stays untouched for the next run
    fakeCli = withFakeCliOnPath({})
    host = await startWebHost({ profile: 'persona', home, env: { VITEST: '' } })
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ channel: 'chrome' })
  }, 420_000)

  afterAll(async () => {
    const lines = ['# Opt-out por flag — o dia da equipe no app real', '', '| Leitura | Desligadas | Shell | Linhas | Vazamento | Console |', '|---|---|---|---|---|---|']
    for (const reading of readings) {
      const leaked = LEAKS.exec(reading.text)
      lines.push(`| ${reading.label} | ${reading.off.length === 0 ? '—' : reading.off.join(', ')} | ${reading.shell ? 'ok' : 'NÃO ABRIU'} | ${String(reading.text.split('\n').length)} | ${leaked === null ? 'nenhum' : `"${leaked[0]}"`} | ${reading.consoleProblems.length === 0 ? 'limpo' : String(reading.consoleProblems.length)} |`)
    }
    try {
      writeFileSync(join(OUT, 'matriz.md'), `${lines.join('\n')}\n`)
      writeFileSync(join(OUT, 'matriz.json'), JSON.stringify(readings.map(({ label, off, shell, consoleProblems, text }) => ({ label, off, shell, consoleProblems, text })), null, 2))
    } catch { /* the report is a convenience; the assertions above are the gate */ }
    await browser?.close().catch(() => {})
    fakeCli?.restore()
    await host?.stop()
    if (home !== '') { try { rmSync(home, { recursive: true, force: true }) } catch { /* the OS temp folder is cleaned later; a locked copy must not fail the suite */ } }
  }, 120_000)

  vitestIt('[OPT-OUT-0 de fábrica] sem nenhuma flag gravada o dia traz o cartão "Proposta de Teo" (Aceitar / Agora não), os cartões do time e nenhum marcador cru', async () => {
    const reading = await readDay('de-fabrica', [])
    expectReadableDay(reading)
    expect(reading.text, 'o cartão da proposta (taskProposal ligada por padrão)').toMatch(/Proposta de Teo/iu)
    expect(reading.text, 'Aceitar / Agora não no cartão da proposta').toMatch(/Aceitar[\s\S]*Agora não/u)
    expect(reading.text, 'o cartão do plano (teamwork ligada por padrão)').toMatch(/dividi assim/iu)
  }, 240_000)

  vitestIt('[OPT-OUT-1 taskProposal] com a proposta DESLIGADA a pessoa lê só a frase simples do host: sem marcador [[task-proposal:…]], sem cartão e sem Aceitar / Agora não na proposta (LEAK-1)', async () => {
    const reading = await readDay('so-taskProposal', ['taskProposal'])
    expectReadableDay(reading)
    expect(reading.text, 'a frase simples da proposta continua verdadeira').toMatch(/Posso destravar/u)
    expect(reading.text, 'sem o cartão "Proposta de Teo" quando a flag está desligada').not.toMatch(/PROPOSTA DE TEO/u)
  }, 240_000)

  vitestIt('[OPT-OUT-2 uma flag por vez] cada flag do cliente (tabela FLAGS) desligada SOZINHA deixa o mesmo dia legível: shell aberto, fio inteiro, sem marcador cru, sem id interno, console limpo', async () => {
    const names = Object.keys(flags)
    expect(names.length, 'a tabela FLAGS do cliente tem flags').toBeGreaterThan(5)
    const bad: string[] = []
    for (const name of names) {
      try {
        expectReadableDay(await readDay(`so-${name}`, [name]))
      } catch (error) {
        bad.push(`${name}: ${error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error)}`)
      }
    }
    expect(bad, `flags que, desligadas, quebram o dia:\n${bad.join('\n')}`).toEqual([])
  }, 1_200_000)

  vitestIt('[OPT-OUT-3 tudo desligado] com TODAS as flags desligadas de uma vez (o app "antes da v1.1") o dia ainda lê sem marcador cru nem id interno e sem erro de console', async () => {
    expectReadableDay(await readDay('todas-desligadas', Object.keys(flags)))
  }, 240_000)
})
