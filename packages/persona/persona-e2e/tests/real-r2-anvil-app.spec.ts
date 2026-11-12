/**
 * STAGING (Anvil, 12/11 11:50): conferência no APP REAL dos itens de UI da Rodada 2 / P1-11, para rodar DEPOIS do "corte gravado" e quando a trava `build` estiver livre.
 * Copiar para packages/persona/persona-e2e/tests/real-r2-anvil-app.spec.ts (ARQUIVO NOVO: avisar o Keel) e rodar um por vez:
 *   node scripts/persona/with-lock.mjs "Anvil e2e r2" --lock build -- node scripts/persona/run-persona-e2e-vitest.mjs packages/persona/persona-e2e/tests/real-r2-anvil-app.spec.ts
 * (PERSONA_E2E=1 já vem do runner; 0 IA real: CLI de mentira no PATH.) Os dados entram pela mesma porta que a tela usa (`hostRpcOk`), como no spec do Gauge.
 *   1. Resumo da empresa (P1-08): descrever → o cartão "Comece aqui" mostra as linhas e o botão "Editar" → o diálogo abre com o texto → salvar troca a descrição.
 *   2. Cofre (P1-08): editar o NOME de um login deixando a senha em branco não pede a senha e o segredo continua guardado (hasSecret).
 *   3. DM de uma persona PAUSADA (P1-11): o cabeçalho diz "Pausada", não "Disponível".
 * Os seletores são os da tela de hoje; se um mudou, ajustar aqui (não a tela).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hireSuggestedTeam, mainText, openGaugeSession, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'
import { hostRpc, hostRpcOk, readTenant, type Tenant } from '../src/gauge-sb-ges.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'real-r2-anvil'
const panel = (slug: string) => REAL_GALLERY_PANELS.find(item => item.slug === slug)!

describe.skipIf(!run).sequential('R2 / P1-11 no app real: Editar o Resumo, Cofre sem redigitar a senha, DM "Pausada"', () => {
  let s: GaugeSession
  let tenant: Tenant
  let scope: { workspaceId: string; projectId: string }

  beforeAll(async () => {
    s = await openGaugeSession({ engine: { kind: 'fake', turnMs: 300, reply: 'Anotado.' } })
    tenant = await readTenant(s.page)
    scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  }, 360_000)

  afterAll(async () => { await s?.close() }, 60_000)

  it('Resumo da empresa: descrever, depois "Editar" abre o diálogo com o texto atual e salvar troca a descrição', async () => {
    const page = s.page
    // The gallery helper still looks for the old label "Segundo cérebro" and this rail has no `data-nav-panel`: go by the label the person reads today.
    const memory = page.getByRole('button', { name: 'Memória da empresa', exact: true }).first()
    if (await memory.count() === 0) await page.getByRole('button', { name: 'Empresa', exact: true }).first().click({ timeout: 15_000 }).catch(() => undefined)
    await memory.click({ timeout: 30_000 })
    await page.locator('[data-persona-surface="second-brain"]').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: 'Descrever a empresa em 3 frases' }).first().click({ timeout: 30_000 })
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('A empresa em 3 frases').fill('Padaria da Ana, bairro Centro. Pães artesanais. Abre de terça a domingo.')
    await dialog.getByRole('button', { name: 'Salvar' }).click()
    await page.getByText('Padaria da Ana, bairro Centro').first().waitFor({ state: 'visible', timeout: 30_000 })
    await shootBothThemes(page, SUITE, 'resumo-com-editar')
    const edit = page.getByRole('button', { name: /^Editar Comece aqui/u })
    await edit.waitFor({ state: 'visible', timeout: 15_000 })
    await edit.click()
    const field = page.getByRole('dialog').getByLabel('A empresa em 3 frases')
    expect(await field.inputValue()).toContain('Padaria da Ana, bairro Centro')
    await field.fill('Padaria Lua, bairro Jardim. Bolos de festa sob encomenda. Abre de quarta a domingo.')
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
    await page.getByText('Padaria Lua, bairro Jardim').first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await mainText(page)).not.toContain('Padaria da Ana, bairro Centro') // a descrição mais nova vence
  })

  it('Cofre: editar o nome de um login com a senha em branco não pede a senha e o segredo continua guardado', async (ctx) => {
    const page = s.page
    const seeded = await hostRpc<{ id: string }>(page, 'saveCofreLogin', { ...scope, site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br', password: 'senha-que-so-o-cofre-ve', title: 'Mercado Livre' })
    // The web host has no Windows vault ("Cofre indisponível neste modo"): only the desktop app seals a secret. Nothing to see here then; the client (connected-cofre-keep-secret) and host (cofre-p0-09) specs carry this case.
    if (!seeded.ok) ctx.skip()
    const saved = seeded.value as { id: string }
    await navigateGalleryPanel(page, panel('configuracoes'))
    const tab = page.getByRole('tab', { name: 'Cofre' })
    if (await tab.count() > 0) await tab.first().click()
    else await page.getByRole('button', { name: 'Cofre', exact: true }).first().click()
    await page.getByRole('button', { name: 'Editar Mercado Livre' }).click({ timeout: 30_000 })
    const side = page.getByRole('complementary', { name: 'Editar login' })
    await side.getByText('Deixe em branco para manter a senha guardada.').waitFor({ state: 'visible', timeout: 10_000 })
    await side.getByLabel('Nome (opcional)').fill('Mercado Livre da loja')
    await side.getByRole('button', { name: 'Guardar' }).click()
    await page.getByText('Mercado Livre da loja').first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await mainText(page)).not.toContain('Digite a senha para guardar.')
    const entries = await hostRpcOk<Array<{ id: string; title: string; hasSecret: boolean }>>(page, 'listCofreEntries', scope)
    expect(entries.find(entry => entry.id === saved.id)).toMatchObject({ title: 'Mercado Livre da loja', hasSecret: true })
    await shootBothThemes(page, SUITE, 'cofre-editado-sem-senha')
  })

  it('DM de uma persona PAUSADA: o cabeçalho da conversa diz "Pausada", não "Disponível"', async () => {
    const page = s.page
    await hireSuggestedTeam(page)
    const personas = await hostRpcOk<Array<{ id: string; name: string }>>(page, 'listPersonas', scope)
    const target = personas.find(persona => persona.name !== '') ?? personas[0]!
    await hostRpcOk(page, 'pausePersona', { ...scope, personaId: target.id })
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await page.getByRole('button', { name: `Conversar com ${target.name}` }).first().click({ timeout: 30_000 })
    // The header of THIS conversation (the pose image beside the chip carries the same data attribute and no text, and the rail has its own "Pausada").
    const chip = page.locator(`section[aria-label="${target.name}"] header [data-persona-state="paused"]`).filter({ hasText: 'Pausada' }).first()
    await chip.waitFor({ state: 'visible', timeout: 30_000 })
    expect((await chip.innerText()).trim()).toBe('Pausada')
    expect(await page.locator(`section[aria-label="${target.name}"] header`).getByText('Disponível', { exact: true }).count()).toBe(0)
    await shootBothThemes(page, SUITE, 'dm-persona-pausada')
  })
})
