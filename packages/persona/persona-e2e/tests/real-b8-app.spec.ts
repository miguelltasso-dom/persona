/**
 * B8 / B9 Tier 1 — o fluxo básico no APP REAL (runner scriptado/CLI fake, 0 IA): mandar mensagem no #geral e ver a resposta,
 * a Tarefa aparecer no quadro, criar e editar persona pela UI. Substitui os 3 `it.todo` de mandatory-b9-real-app.spec.ts.
 */
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import type { Page } from 'playwright'
import { mainText, openGaugeSession, panelHealth, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'
import { navigateProfileViaRailCard } from '../src/real-gallery/navigate-panel.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'b8'

function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 180_000): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

const railCount = async (page: Page): Promise<number> => {
  const text = await page.locator('#persona-rail-team-title').innerText().catch(() => '')
  return Number(/(\d+)/u.exec(text)?.[1] ?? '0')
}
const messageCount = async (page: Page): Promise<number> => await page.locator('li[data-message-id]').count()
/** Authors of the messages rendered AFTER the one containing `text` (the replies). */
const repliesAfter = async (page: Page, text: string): Promise<string[]> => await page.locator('li[data-message-id]').evaluateAll((els, needle) => {
  const at = els.findIndex(el => (el.textContent ?? '').includes(needle))
  if (at < 0) return []
  const mine = els[at]?.getAttribute('data-author') ?? ''
  return els.slice(at + 1).map(el => el.getAttribute('data-author') ?? '').filter(author => author !== mine)
}, text)

describe.skipIf(!run)('B8 app — #geral → resposta → Tarefa no quadro → criar/editar persona', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  bug('Anvil+Prism', '[P0][B8-1] mensagem no #geral: aparece na hora, o compositor limpa e uma persona responde em ≤ 40 s (sem fatais de console)', async () => {
    const health = await panelHealth(s, 'geral')
    expect(health.fatals).toEqual([])
    const composer = s.page.getByPlaceholder(/Mensagem em/u).first()
    await composer.fill('preciso de um README no projeto Gauge')
    await s.page.keyboard.press('Enter')
    await s.page.getByText('preciso de um README no projeto Gauge').first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await composer.inputValue(), 'compositor limpou depois de enviar').toBe('')
    await expect.poll(async () => (await repliesAfter(s.page, 'preciso de um README no projeto Gauge')).length, { timeout: 40_000, message: 'nenhuma resposta da persona' }).toBeGreaterThanOrEqual(1)
    await shootBothThemes(s.page, SUITE, 'b8-geral-resposta')
    expect(s.console.fatalCount()).toBe(0)
  }, 120_000)

  bug('Anvil+Prism', '[P0][B8-2] (depende do envio no #geral) a Tarefa criada pela mensagem aparece no quadro do projeto', async () => {
    await panelHealth(s, 'kanban')
    const back = s.page.getByRole('button', { name: 'Voltar aos quadros' })
    if (await back.count() > 0) await back.first().click()
    await s.page.getByText('Pessoal', { exact: true }).first().click()
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(async () => await mainText(s.page), { timeout: 30_000, message: 'cartão da Tarefa não apareceu no quadro' }).toMatch(/README/u)
    await shootBothThemes(s.page, SUITE, 'b8-quadro-com-tarefa')
  }, 120_000)

  vitestIt('[B8-3] criar persona do zero pelo editor: aparece no rail e sobrevive a um recarregamento', async () => {
    const before = await railCount(s.page)
    await s.page.getByRole('button', { name: 'Visão geral', exact: true }).first().click()
    await s.page.getByRole('button', { name: 'Contratar persona' }).click()
    await s.page.getByRole('button', { name: 'Pular assistente' }).click()
    await s.page.getByRole('heading', { name: 'Nova persona' }).waitFor({ state: 'visible', timeout: 30_000 })
    const boxes = s.page.getByRole('textbox')
    await boxes.nth(1).fill('Gauge Teste')
    await boxes.nth(2).fill('Revisora de texto')
    await boxes.nth(3).fill('Revisa textos curtos e aponta erros.')
    await shootBothThemes(s.page, SUITE, 'b8-editor-persona-preenchido')
    await s.page.getByRole('button', { name: 'Salvar persona' }).click()
    await expect.poll(() => railCount(s.page), { timeout: 30_000, message: 'a persona nova não chegou ao rail' }).toBeGreaterThanOrEqual(before + 1)
    await s.page.reload({ waitUntil: 'load' })
    await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await expect.poll(() => s.page.getByRole('button', { name: /Conversar com Gauge Teste/u }).count(), { timeout: 30_000 }).toBeGreaterThan(0)
  }, 240_000)

  vitestIt('[B8-4] editar a persona criada pelo Perfil ("Editar persona"): o novo cargo aparece depois de salvar', async () => {
    await navigateProfileViaRailCard(s.page, 'Gauge Teste')
    await s.page.getByRole('button', { name: 'Editar persona' }).click()
    await s.page.getByRole('heading', { name: /Editar|Nova persona|Gauge Teste/u }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const boxes = s.page.getByRole('textbox')
    const values = await boxes.evaluateAll(els => els.map(el => (el as HTMLInputElement).value))
    const roleIndex = values.findIndex(value => value === 'Revisora de texto')
    expect(roleIndex, `campo "Cargo" não encontrado entre ${JSON.stringify(values.slice(0, 5))}`).toBeGreaterThanOrEqual(0)
    await boxes.nth(roleIndex).fill('Revisora sênior')
    await shootBothThemes(s.page, SUITE, 'b8-editar-persona')
    await s.page.getByRole('button', { name: /Salvar persona|Salvar/u }).first().click()
    await expect.poll(async () => await s.page.locator('body').innerText(), { timeout: 30_000, message: 'cargo novo não apareceu' }).toMatch(/Revisora sênior/u)
  }, 180_000)

  bug('Prism', '[B8] resposta da persona no #geral vem no assunto ativo e SEM duplicata (uma mensagem do usuário → uma resposta)', async () => {
    await panelHealth(s, 'geral')
    const before = await messageCount(s.page)
    await s.page.getByPlaceholder(/Mensagem em/u).first().fill('oi, tudo bem? (gauge único)')
    await s.page.keyboard.press('Enter')
    await s.page.waitForTimeout(15_000)
    expect(await messageCount(s.page) - before, 'mensagens novas (1 do usuário + 1 resposta)').toBe(2)
  }, 120_000)
})
