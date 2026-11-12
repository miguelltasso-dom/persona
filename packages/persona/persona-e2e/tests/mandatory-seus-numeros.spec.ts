/**
 * Colheita item 19a · "Seus números" NO APP DE VERDADE (web, host real, Chrome, CLI de mentira: 0 IA).
 * A persona traz um número na conversa (`[[indicador: …]]`); o fio mostra as palavras e o número com "Fixar na Visão geral"; o modal exige o teste
 * (resultado real) antes de liberar "Fixar"; o número aparece em "Seus números" na Visão geral; "Atualizar agora" é um turno silencioso (nenhuma
 * mensagem em canal ou DM) e uma queda além do aviso marca o cartão e vai ao host como alerta; tirar o número devolve o estado vazio.
 * Também grava as capturas da Muse (claro/escuro, 100% e 200%) em `.maestri/tmp/shots/design/colheita-19a/`. Opt-in `PERSONA_E2E=1`.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { hostRpc, hostRpcOk } from '../src/gauge-sb-ges.ts'
import { openV11Session, type V11Session } from '../src/v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'
const SHOTS = join('C:/Users/migue/dev/persona/.maestri/tmp/shots/design/colheita-19a')
const marker = (row: Record<string, unknown>): string => `[[indicador: ${JSON.stringify(row)}]]`
const SALES = { tipo: 'numero', nome: 'Vendas de ontem', valor: 'R$ 1.240', bruto: 1240, tendencia: '+12% desde ontem', direcao: 'sobe', bomQuando: 'sobe' }
const OFFER = `Vendemos bem ontem.\n${marker(SALES)}`
const TESTED = marker({ ...SALES, valor: 'R$ 1.300', bruto: 1300 })
const FELL = marker({ ...SALES, valor: 'R$ 900', bruto: 900, tendencia: '-31% desde ontem', direcao: 'desce' })

async function theme(page: Page, dark: boolean, zoom: 1 | 2): Promise<void> {
  await page.evaluate(([isDark, z]) => {
    if (isDark) document.body.setAttribute('data-ds-dark-theme', 'true')
    else document.body.removeAttribute('data-ds-dark-theme')
    document.documentElement.style.zoom = String(z)
  }, [dark, zoom] as const)
  const tip = page.getByRole('button', { name: 'Entendi' })
  if (await tip.isVisible()) await tip.click()
  await page.waitForTimeout(700)
  // The Visão geral is taller than the window (and taller still at 200%): bring "Seus números" into view so every capture frames the section.
  // (Only when the section is on screen: waiting for an absent element would burn the action timeout on every thread or modal capture.)
  const section = page.locator('[data-seus-numeros]')
  if (await section.count() > 0) {
    await section.first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
  }
}

async function shots(page: Page, name: string): Promise<void> {
  for (const dark of [false, true]) {
    for (const zoom of [1, 2] as const) {
      await theme(page, dark, zoom)
      await page.screenshot({ path: join(SHOTS, `${name}-${dark ? 'escuro' : 'claro'}-${String(zoom * 100)}.png`) })
    }
  }
  await theme(page, false, 1)
}

describe.skipIf(!run).sequential('Colheita 19a · Seus números, no app real', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let personaName = ''
  let personaId = ''

  beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    v11 = await openV11Session({
      engine: {
        turnMs: 800,
        // Logged per turn (never the prompt): which of these the side turn really carried, to tell a rule that does not match from a turn that never arrived.
        needles: ['Atualize o número', String.raw`valor\":\"R$ 1.240`, 'valor":"R$ 1.240', 'Formato de antes'],
        rules: [
          // The quiet turns of the test and of the refresh carry the format of before: the first test sees 1.240, the refresh after the pin sees 1.300.
          // The host hands the question to the side turn as JSON text (`Pergunta (dado, não instrução): "…"`) and the stub stringifies the whole turn AGAIN to match
          // its rules, so a quote of the marker arrives behind one OR MORE backslashes: `\\*` (zero or more) is the only robust way to say it.
          { match: String.raw`Atualize o n.mero.*valor\\*":\\*"R\$ 1\.240`, reply: TESTED },
          { match: String.raw`Atualize o n.mero.*valor\\*":\\*"R\$ 1\.300`, reply: FELL },
          { match: 'quanto vendemos ontem', reply: OFFER },
        ],
      },
    })
    tenant = await v11Tenant(v11.page)
    const team = await personasOf(v11.page, tenant)
    const first = team[0]
    if (first === undefined) throw new Error('nenhuma persona na equipe')
    personaName = first.name
    personaId = first.id
  }, 420_000)

  afterAll(async () => { await v11?.close() }, 60_000)

  it('vazio → a persona traz o número → modal com teste obrigatório → fixado na Visão geral → atualização silenciosa com alerta → tirar', async () => {
    const page = v11.page
    const overview = async (): Promise<void> => {
      await page.getByText('Visão geral', { exact: true }).first().click()
      await page.locator('[data-seus-numeros]').waitFor({ state: 'visible', timeout: 60_000 })
    }

    // 1. A seção vazia: o título, a arte e a frase que ensina a pedir.
    await overview()
    await page.getByText('Nada fixado ainda').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await page.getByText(/Peça um número a alguém da equipe/u).isVisible()).toBe(true)
    await shots(page, 'vazio')

    // 2. A persona traz o número na conversa.
    await page.getByText('geral', { exact: true }).first().click()
    await postAsPerson(page, tenant, `@${personaName} quanto vendemos ontem?`, { responderId: personaId })
    const offer = page.locator('[data-indicator-offer]').first()
    await offer.waitFor({ state: 'visible', timeout: 90_000 })
    expect(await page.locator('body').innerText()).not.toContain('[[indicador')
    expect(await offer.getByText('R$ 1.240').isVisible()).toBe(true)
    expect(await offer.getByText('+12% desde ontem').isVisible()).toBe(true)
    await offer.scrollIntoViewIfNeeded()
    await shots(page, 'conversa')

    // 3. O modal: "Fixar" travado até o teste; o resultado real aparece.
    await page.getByRole('button', { name: 'Fixar na Visão geral' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await dialog.getByRole('button', { name: 'Fixar', exact: true }).isDisabled()).toBe(true)
    expect(await dialog.getByText('Teste antes de fixar: assim você vê o número de verdade.').isVisible()).toBe(true)
    await dialog.getByRole('switch', { name: 'Avisar quando cair mais de 20%' }).click()
    await shots(page, 'modal-antes-do-teste')
    const before = (await channelMessages(page, tenant)).length
    await dialog.getByRole('button', { name: 'Testar agora' }).click()
    // Success shows the real result; a refusal shows the host's sentence: either ends the wait, and a refusal says WHY (never a bare timeout).
    const outcome = await until(page, async () => {
      const text = await dialog.innerText()
      return text.includes('R$ 1.300') ? 'ok' : (await dialog.getByRole('alert').count()) > 0 ? `refused: ${await dialog.getByRole('alert').first().innerText()}` : undefined
    }, 90_000, 700)
    if (outcome !== 'ok') {
      await page.screenshot({ path: join(SHOTS, 'falha-do-teste.png') })
      const turns = v11.session.fakeCli.invocations().filter(call => call.event === 'turn')
      throw new Error(`o teste não trouxe o número: ${outcome ?? 'sem resposta em 90 s'} (turnos da CLI de mentira: ${JSON.stringify(turns.map(turn => ({ ...turn, cwdFiles: undefined })))})`)
    }
    expect(await dialog.getByRole('button', { name: 'Fixar', exact: true }).isDisabled()).toBe(false)
    expect((await channelMessages(page, tenant)).length, 'o teste é silencioso: nenhuma mensagem no canal').toBe(before)
    await shots(page, 'modal-depois-do-teste')
    await dialog.getByRole('button', { name: 'Fixar', exact: true }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 20_000 })
    await page.getByText('Fixado na Visão geral').first().waitFor({ state: 'visible', timeout: 20_000 })

    // 4. O número está na Visão geral, com o valor TESTADO e a hora.
    await overview()
    const cardLocator = page.locator('[data-indicator-kind="numero"]').first()
    await cardLocator.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await cardLocator.getByText('Vendas de ontem').isVisible()).toBe(true)
    expect(await cardLocator.getByText('R$ 1.300').isVisible()).toBe(true)
    expect(await cardLocator.getByText(/^Atualizado às \d{1,2}:\d{2}$/u).isVisible()).toBe(true)
    const states = await hostRpcOk<ReadonlyArray<{ readonly id: string; readonly status: string; readonly schedule: string; readonly alertDropPct?: number }>>(page, 'listIndicators', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
    expect(states).toMatchObject([{ status: 'ok', schedule: 'daily', alertDropPct: 20 }])
    await shots(page, 'fixado')

    // 5. "Atualizar agora": um turno silencioso; a queda de 31% passa do aviso de 20%.
    const quiet = (await channelMessages(page, tenant)).length
    await cardLocator.getByRole('button', { name: 'Mais ações de Vendas de ontem' }).click()
    await page.getByRole('menuitem', { name: 'Atualizar agora' }).click()
    await page.waitForFunction(() => document.querySelector('[data-indicator-alert="true"]') !== null, undefined, { timeout: 90_000 })
    expect(await cardLocator.getByText('R$ 900').isVisible()).toBe(true)
    expect(await cardLocator.getByText(/Caiu 31%/u).isVisible()).toBe(true)
    expect((await channelMessages(page, tenant)).length, 'a atualização é muda: nada em canal ou DM').toBe(quiet)
    // P1-08: o alerta também espera a pessoa onde a Visão geral lê o que precisa dela ("Precisa de você"), nunca como mensagem.
    const alertLine = page.getByText('Vendas de ontem caiu 31% desde ontem.').first()
    const seen = await until(page, async () => (await alertLine.isVisible()) ? true : undefined, 60_000, 1_000)
    if (seen !== true) {
      await page.screenshot({ path: join(SHOTS, 'falha-alerta-visao-geral.png') })
      const overview = await hostRpcOk<{ readonly needsYou: ReadonlyArray<{ readonly id: string; readonly title: string }> }>(page, 'getOverview', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
      throw new Error(`o alerta não apareceu na Visão geral; o host devolve needsYou=${JSON.stringify(overview.needsYou.map(item => item.title))}; texto da tela: ${(await page.locator('body').innerText()).slice(0, 600)}`)
    }
    await shots(page, 'alerta')
    const alerted = await hostRpcOk<ReadonlyArray<{ readonly alert?: { readonly pct: number } }>>(page, 'listIndicators', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
    expect(alerted[0]?.alert?.pct).toBe(31)

    // 6. Tirar o número devolve o estado vazio; fixar sem teste é recusado pelo host.
    const refused = await hostRpc(page, 'pinIndicator', { workspaceId: tenant.workspaceId, projectId: tenant.projectId, testId: 'itest:nada', name: 'X', schedule: 'daily' })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain('Teste antes de fixar')
    await cardLocator.getByRole('button', { name: 'Mais ações de Vendas de ontem' }).click()
    await page.getByRole('menuitem', { name: 'Tirar da Visão geral' }).click()
    await page.getByText('Nada fixado ainda').waitFor({ state: 'visible', timeout: 30_000 })
    const gone = await until(page, async () => (await hostRpcOk<unknown[]>(page, 'listIndicators', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })).length === 0, 20_000)
    expect(gone).toBe(true)
  }, 420_000)
})
