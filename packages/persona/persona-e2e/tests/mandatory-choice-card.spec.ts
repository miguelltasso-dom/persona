/**
 * Colheita item 11 · o cartão de escolha do fim da vez NO APP DE VERDADE (web, host real, Chrome, CLI de mentira: 0 IA).
 * A persona termina a vez com `[[escolha: …]]`; o fio mostra as palavras dela e o cartão A a C logo abaixo (sem o marcador na tela); o toque em B
 * vira a mensagem curta da pessoa `✓ B · …`, a persona responde (turno novo) e o cartão fica só leitura, inclusive depois de recarregar.
 * Também grava as capturas da Muse (claro/escuro, 100% e 200%, quadro do meio do ✓) em `.maestri/tmp/shots/design/colheita-11/`.
 * Opt-in `PERSONA_E2E=1`; um host, ~3 min.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { hostRpc, hostRpcOk } from '../src/gauge-sb-ges.ts'
import { openV11Session, type V11Session } from '../src/v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'
const SHOTS = join('C:/Users/migue/dev/persona/.maestri/tmp/shots/design/colheita-11')
const OFFER = 'Fiz as duas versões do post de sexta.\n[[escolha: Qual delas publicamos? | Post para o Instagram | Post para o Facebook | Nenhuma, refaça]]'
const CARD = '[data-persona-ask-kind="fimDoTurno"]'

async function shot(page: Page, name: string, dark: boolean, zoom: 1 | 2): Promise<void> {
  await page.evaluate(([isDark, z]) => {
    if (isDark) document.body.setAttribute('data-ds-dark-theme', 'true')
    else document.body.removeAttribute('data-ds-dark-theme')
    document.documentElement.style.zoom = String(z)
  }, [dark, zoom] as const)
  await page.locator(CARD).first().scrollIntoViewIfNeeded()
  // A dica de primeira vez do app ("A Coordenação distribui o pedido") não é do cartão e cobre o rodapé: some antes de capturar.
  const tip = page.getByRole('button', { name: 'Entendi' })
  if (await tip.isVisible()) await tip.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(SHOTS, `${name}-${dark ? 'escuro' : 'claro'}-${String(zoom * 100)}.png`) })
  await page.evaluate(() => { document.documentElement.style.zoom = '1' })
}

describe.skipIf(!run).sequential('Colheita 11 · cartão de escolha do fim da vez, no app real', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let personaName = ''
  let personaId = ''

  beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    v11 = await openV11Session({
      engine: {
        turnMs: 800,
        rules: [
          { match: '✓ B', reply: 'Combinado: publico o post do Facebook hoje.' },
          { match: 'post de sexta', reply: OFFER },
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

  it('a persona oferece; o fio mostra as palavras e o cartão (sem marcador); o toque em B vira a mensagem curta e abre o turno novo; o cartão fica só leitura, também depois de recarregar', async () => {
    const page = v11.page
    await postAsPerson(page, tenant, `@${personaName} preciso do post de sexta`, { responderId: personaId })
    await page.locator(CARD).first().waitFor({ state: 'visible', timeout: 90_000 })

    // O host guarda o que ela escreveu; a tela mostra só as palavras e o cartão.
    const stored = (await channelMessages(page, tenant)).find(message => message.body.includes('Fiz as duas versões'))
    expect(stored, 'a mensagem da persona com o cartão').toBeDefined()
    expect(stored?.body).not.toContain('[[')
    expect(await page.locator('body').innerText()).not.toContain('[[escolha')
    expect(await page.getByRole('radio').count()).toBe(3)
    expect(await page.getByRole('radio').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-letter')))).toEqual(['A', 'B', 'C'])
    expect(await page.getByText('Escolha um caminho').isVisible()).toBe(true)
    expect(await page.getByText(/Sem pressa: .+ segue quando você escolher\./u).isVisible()).toBe(true)
    const card = page.locator(CARD).first()
    // Alturas da régua: cada opção tem pelo menos 40 px, a letra é um círculo de 24 px.
    const heights = await page.getByRole('radio').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(40)
    const letter = await page.locator(`${CARD} [data-letter="A"] span`).first().boundingBox()
    expect(Math.round(letter?.width ?? 0)).toBe(24)

    for (const dark of [false, true]) for (const zoom of [1, 2] as const) await shot(page, 'aberto', dark, zoom)

    // O toque: a opção B (no tema claro).
    await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme') })
    await page.getByRole('radio', { name: /Post para o Facebook/u }).click()
    // Quadro do meio do ✓ (o traço desenhando): pausa na metade só as animações do cartão.
    await page.evaluate((selector) => {
      for (const animation of document.getAnimations()) {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
        const timing = animation.effect?.getTiming()
        if (target instanceof Element && target.closest(selector) !== null && typeof timing?.duration === 'number' && timing.duration > 0) { animation.pause(); animation.currentTime = timing.duration / 2 }
      }
    }, CARD)
    await page.screenshot({ path: join(SHOTS, 'meio-do-traco-claro-100.png') })
    await page.evaluate((selector) => { for (const animation of document.getAnimations()) { const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null; if (target instanceof Element && target.closest(selector) !== null) animation.play() } }, CARD)
    await page.getByText(/Você escolheu B/u).waitFor({ state: 'visible', timeout: 20_000 })
    expect(await card.getAttribute('data-persona-ask-state')).toBe('answered')

    // O host: a mensagem curta da pessoa, endereçada à persona, e a resposta do turno novo.
    const tap = await until(page, async () => (await channelMessages(page, tenant)).find(message => message.body === '✓ B · Post para o Facebook'), 30_000)
    expect(tap, 'a mensagem curta da pessoa').toBeDefined()
    expect(tap?.actorId).toBe(tenant.memberId)
    const reply = await until(page, async () => (await channelMessages(page, tenant)).find(message => /Combinado: publico o post do Facebook/u.test(message.body)), 90_000)
    expect(reply, 'o turno novo: a persona respondeu ao toque').toBeDefined()
    expect(reply?.actorId).toBe(personaId)
    const states = await hostRpcOk<ReadonlyArray<{ readonly kind?: string; readonly status: string; readonly answer?: { readonly optionIds: readonly string[] } }>>(page, 'listPersonaAsks', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
    expect(states.filter(row => row.kind === 'fimDoTurno')).toMatchObject([{ status: 'answered', answer: { optionIds: ['b'] } }])

    for (const dark of [false, true]) for (const zoom of [1, 2] as const) await shot(page, 'respondido', dark, zoom)

    // Recarregar: o cartão continua respondido e nenhuma escolha nova é possível.
    await page.reload({ waitUntil: 'load' })
    await page.locator(CARD).first().waitFor({ state: 'visible', timeout: 90_000 })
    // O estado vivo do host chega logo depois de o cartão montar: espere por ele (e só por ele).
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-persona-ask-state') === 'answered', CARD, { timeout: 20_000 })
    expect(await page.getByText(/Você escolheu B/u).isVisible()).toBe(true)
    // Já respondido ao chegar: o traço do ✓ não desenha de novo (o cartão aparece pronto).
    expect(await page.locator(`${CARD} [data-fresh="true"]`).count()).toBe(0)
    for (const dark of [false, true]) await shot(page, 'recarregado', dark, 1)
    const second = await hostRpc(page, 'answerChoice', { workspaceId: tenant.workspaceId, projectId: tenant.projectId, messageId: stored?.id ?? '', optionId: 'a' })
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/conflict|já escolheu/u)
  }, 300_000)
})
