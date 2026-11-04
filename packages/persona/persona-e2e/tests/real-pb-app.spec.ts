/**
 * PB-9 — APP layer (real `persona` profile in Chrome, fake CLIs, 0 AI): PROJECT-BOARDS.md §3 as a person sees it —
 * Quadros list/board, Editar fluxo (add/persist/remove), Sugestão da Coordenação, Sprints, with light/dark captures,
 * axe (critical/serious must be 0) and the panel health gate.
 * Host contracts: {@link ./mandatory-project-boards-host.spec.ts}. GOV app layer: {@link ./real-gov-pb-app.spec.ts}.
 */
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import { scanAccessibility } from '../src/axe-check.ts'
import { blockingAxe, mainText, openGaugeSession, panelHealth, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'pb'

/** Known product bug: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 120_000): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

describe.skipIf(!run)('PB-9 app — Quadros por projeto: fluxo próprio, editar fluxo, sugestão da Coordenação, sprints', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  const flowHeader = async (): Promise<string> =>
    (await mainText(s.page)).split('\n').find(line => /Fluxo próprio deste projeto/u.test(line)) ?? ''

  const openBoard = async (): Promise<void> => {
    const back = s.page.getByRole('button', { name: 'Voltar aos quadros' })
    if (await back.count() > 0) await back.first().click()
    const health = await panelHealth(s, 'kanban')
    expect(health.fatals).toEqual([])
    await s.page.getByText('Pessoal', { exact: true }).first().click()
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().waitFor({ state: 'visible', timeout: 30_000 })
  }

  vitestIt('[PB-9 app] lista de Quadros e quadro do projeto: sem tela em branco, sem carregando preso, sem fatais, axe sem crítico/sério; capturas claro/escuro', async () => {
    const health = await panelHealth(s, 'kanban')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    expect(health.blank, health.detail).toBe(false)
    expect(health.axe.skipped, `axe: ${health.axe.reason ?? ''}`).toBe(false)
    expect(blockingAxe(health.axe).join(' || ')).toBe('')
    await shootBothThemes(s.page, SUITE, 'pb-quadros-lista')
    await openBoard()
    const text = await mainText(s.page)
    expect(text).toMatch(/Fluxo próprio deste projeto/u)
    expect(text).not.toMatch(/undefined|\[object|NaN/u)
    await shootBothThemes(s.page, SUITE, 'pb-quadro-do-projeto')
    expect(blockingAxe(await scanAccessibility(s.page)).join(' || '), 'axe no quadro').toBe('')
  }, 180_000)

  vitestIt('[PB-9.3 app] Editar fluxo: adicionar coluna, salvar, recarregar (persistiu) e remover — o quadro acompanha', async () => {
    await openBoard()
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().click()
    const dlg = s.page.getByRole('dialog').last()
    await dlg.getByText('Editor de fluxo').waitFor({ state: 'visible', timeout: 15_000 })
    const before = await dlg.getByRole('button', { name: 'Remover coluna' }).count()
    const valuesBefore = await dlg.locator('input').evaluateAll(els => els.map(el => (el as HTMLInputElement).value))
    await dlg.getByRole('button', { name: '+ Adicionar coluna' }).click()
    await expect.poll(async () => await dlg.getByRole('button', { name: 'Remover coluna' }).count()).toBe(before + 1)
    const valuesAfter = await dlg.locator('input').evaluateAll(els => els.map(el => (el as HTMLInputElement).value))
    const newIndex = valuesAfter.findIndex((value, index) => value !== valuesBefore[index])
    expect(newIndex, 'a coluna nova tem um campo de nome').toBeGreaterThanOrEqual(0)
    await dlg.locator('input').nth(newIndex).fill('Revisão final Gauge')
    await dlg.getByRole('button', { name: 'Salvar fluxo' }).click()
    await dlg.waitFor({ state: 'hidden', timeout: 15_000 })
    await s.page.getByText('Revisão final Gauge').first().waitFor({ state: 'visible', timeout: 20_000 })
    await shootBothThemes(s.page, SUITE, 'pb-fluxo-editado')
    await s.page.reload({ waitUntil: 'load' })
    await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await openBoard()
    await s.page.getByText('Revisão final Gauge').first().waitFor({ state: 'visible', timeout: 20_000 })
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().click()
    const dlg2 = s.page.getByRole('dialog').last()
    const removeButtons = dlg2.getByRole('button', { name: 'Remover coluna' })
    await removeButtons.nth((await removeButtons.count()) - 1).click()
    await dlg2.getByRole('button', { name: 'Salvar fluxo' }).click()
    await dlg2.waitFor({ state: 'hidden', timeout: 15_000 })
    await s.page.waitForTimeout(800)
    expect(await mainText(s.page)).not.toContain('Revisão final Gauge')
  }, 300_000)

  vitestIt('[PB-9.5 app] Sugestão da Coordenação: mostra o fluxo proposto com as colunas; "Agora não" não muda o fluxo', async () => {
    await openBoard()
    const before = await flowHeader()
    await s.page.getByRole('button', { name: 'Sugestão da Coordenação' }).click()
    await s.page.getByText(/Usar este fluxo:/u).first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await s.page.getByRole('button', { name: 'Usar este fluxo' }).count()).toBeGreaterThan(0)
    await shootBothThemes(s.page, SUITE, 'pb-sugestao-da-coordenacao')
    await s.page.getByRole('button', { name: 'Agora não' }).click()
    await s.page.waitForTimeout(500)
    expect(await flowHeader(), 'recusar a sugestão não pode mudar o fluxo').toBe(before)
  }, 120_000)

  vitestIt('[PB-9.4 app] aba Sprints: formulário de planejamento (nome, objetivo, início, fim); "Iniciar sprint" fica desligado sem tarefas', async () => {
    await openBoard()
    await s.page.getByRole('tab', { name: 'Sprints' }).or(s.page.getByText('Sprints', { exact: true })).first().click()
    await s.page.getByText('Planejar sprint').first().waitFor({ state: 'visible', timeout: 20_000 })
    const text = await mainText(s.page)
    for (const label of ['Nome', 'Objetivo', 'Início', 'Fim', 'Backlog']) expect(text, label).toContain(label)
    expect(await s.page.getByRole('button', { name: 'Iniciar sprint' }).isDisabled(), 'sprint sem tarefas não inicia').toBe(true)
    await shootBothThemes(s.page, SUITE, 'pb-sprints-planejar')
    await s.page.getByRole('button', { name: 'Cancelar' }).click()
  }, 120_000)

  bug('Lumen', '[PB-9 app] "Nova tarefa" (ação primária do quadro) abre um formulário/entrada — hoje o clique não faz nada visível', async () => {
    await openBoard()
    const cardsBefore = await s.page.getByRole('button', { name: 'Ações da tarefa' }).count()
    await s.page.getByRole('button', { name: 'Nova tarefa' }).click()
    await s.page.waitForTimeout(1_500)
    const dialogs = await s.page.getByRole('dialog').count()
    const inputs = await s.page.locator('[data-persona-surface] input:visible, [data-persona-surface] textarea:visible').count()
    const cardsAfter = await s.page.getByRole('button', { name: 'Ações da tarefa' }).count()
    expect(dialogs + inputs + (cardsAfter - cardsBefore), 'nada apareceu depois de "Nova tarefa"').toBeGreaterThan(0)
  })

  bug('Lumen+Prism', '[PB-9.1 app] "Novo projeto" → modelo "Site / produto" → "Usar este modelo" CRIA um projeto novo "Site" na lista de Quadros (hoje troca o fluxo do projeto Pessoal e não cria nada)', async () => {
    const health = await panelHealth(s, 'kanban')
    expect(health.fatals).toEqual([])
    const cardsBefore = await s.page.getByRole('button', { name: 'Ações do projeto' }).count()
    await s.page.getByRole('button', { name: 'Novo projeto' }).click()
    await s.page.getByRole('button', { name: 'Site / produto', exact: true }).click()
    await s.page.getByRole('button', { name: 'Usar este modelo' }).click()
    await s.page.waitForTimeout(2_500)
    expect(await s.page.getByRole('button', { name: 'Ações do projeto' }).count(), 'nenhum projeto novo na lista').toBe(cardsBefore + 1)
  })

  bug('Lumen', '[PB-9.1 app] a etiqueta do fluxo no cartão da lista de Quadros acompanha o fluxo real do quadro (depois de trocar o modelo o cartão diz "Simples" e o quadro "Contratação")', async () => {
    await panelHealth(s, 'kanban')
    const listText = await mainText(s.page)
    await s.page.getByText('Pessoal', { exact: true }).first().click()
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const header = await flowHeader()
    const boardTemplate = /^(\S+)/u.exec((await mainText(s.page)).split('\n').find(line => /Fluxo próprio deste projeto/u.test(line)) ?? '')?.[1] ?? ''
    void boardTemplate
    const template = (header.split('·')[0] ?? '').trim()
    expect(listText, `lista deveria citar "${template}"`).toContain(template)
  })
})
