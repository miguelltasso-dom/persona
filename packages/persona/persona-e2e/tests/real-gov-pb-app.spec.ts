/**
 * GOV-10 + PB-9 — APP layer (real `persona` profile in Chrome, fake CLIs on PATH, 0 AI): the GOVERNANCE.md §4 and
 * PROJECT-BOARDS.md §3 scenarios as a person sees them, with light/dark captures, axe, stuck-loading and console gates.
 * Host-level contracts: {@link ./mandatory-governance-host.spec.ts}, {@link ./mandatory-project-boards-host.spec.ts}.
 * Run (one host): PERSONA_E2E=1 under `with-lock` — see README "Gauge".
 */
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import {
  advisoryAxe,
  assistantToPreview,
  blockingAxe,
  mainText,
  openGaugeSession,
  openStructureAssistant,
  panelHealth,
  shootBothThemes,
  type GaugeSession,
} from '../src/gauge-app.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'gov-pb'

/** Number on the "Sua equipe" rail group (0 when unreadable). */
async function railTeamCount(page: GaugeSession['page']): Promise<number> {
  const text = await page.locator('#persona-rail-team-title').innerText().catch(() => '')
  return Number(/(\d+)/u.exec(text)?.[1] ?? '0')
}

/** "Pular assistente" opens the blank persona editor (a full page, not a modal): leave through the shell home. */
async function leaveAssistant(page: GaugeSession['page']): Promise<void> {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'hidden', timeout: 15_000 })
}

/** Known product bug: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 120_000): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

describe.skipIf(!run)('GOV-10 app — Quem cuida de quem, Saúde, Teste dos 2 dias, assistente', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  for (const [company, titleHint] of [['Agência', 'Criação'], ['SaaS', 'Produto'], ['Escritório', 'Atendimento']] as const) {
    vitestIt(`[GOV-5 app] assistente para "${company}": 3–5 personas por FUNÇÃO contínua, explicação visível, nada por tarefa`, async () => {
      await openStructureAssistant(s.page)
      await assistantToPreview(s.page, company)
      const personas = await s.page.getByRole('button', { name: /— (Planejada|Coordena ativa)$/u }).allTextContents()
      const labels = await s.page.getByRole('button').evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? '').filter(text => /— (Planejada|Coordena ativa)$/u.test(text)))
      const count = Math.max(personas.length, labels.length)
      expect(count, `${company}: personas na prévia`).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(5)
      expect(labels.some(label => label.includes('Coordena ativa')), 'a Coordenação aparece como braço direito').toBe(true)
      const text = await s.page.locator('body').innerText()
      expect(text).toContain('Teste dos 2 dias')
      expect(text).toMatch(/Definir substituto/u)
      expect(text, titleHint).toMatch(new RegExp(titleHint, 'u'))
      expect(text).not.toMatch(/undefined|\[object|NaN/u)
      if (company === 'Agência') await shootBothThemes(s.page, SUITE, 'gov-assistente-previa')
      await leaveAssistant(s.page)
    }, 180_000)
  }

  vitestIt('[GOV-1 app] contratar a equipe sugerida: as personas chegam ao rail e ao organograma "Por pessoa" sob o dono; "Por setor" reagrupa', async () => {
    const before = await railTeamCount(s.page)
    await openStructureAssistant(s.page)
    await assistantToPreview(s.page, 'Agência')
    await s.page.getByRole('button', { name: 'Contratar equipe sugerida' }).click()
    await expect.poll(() => railTeamCount(s.page), { timeout: 60_000 }).toBeGreaterThanOrEqual(Math.min(before + 4, 5))
    await shootBothThemes(s.page, SUITE, 'gov-assistente-apos-contratar')
    await leaveAssistant(s.page)
    const health = await panelHealth(s, 'org-chart')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    expect(health.blank, health.detail).toBe(false)
    const person = await mainText(s.page)
    for (const name of ['Coordenação', 'Atendimento', 'Criação', 'Mídia']) expect(person, `persona ${name} no organograma`).toContain(name)
    expect(person).toMatch(/personas/u)
    await shootBothThemes(s.page, SUITE, 'gov-organograma-por-pessoa')
    await s.page.getByRole('tab', { name: 'Por setor' }).click()
    await s.page.waitForTimeout(600)
    const sector = await mainText(s.page)
    expect(sector).not.toMatch(/undefined|\[object/u)
    await shootBothThemes(s.page, SUITE, 'gov-organograma-por-setor')
    await s.page.getByRole('tab', { name: 'Lista' }).click()
    await s.page.waitForTimeout(400)
    expect(await s.page.getByRole('list').count(), 'modo lista acessível por teclado (role=list)').toBeGreaterThan(0)
    await s.page.getByRole('tab', { name: 'Organograma' }).click()
    await s.page.getByRole('tab', { name: 'Por pessoa' }).click()
  }, 240_000)

  vitestIt('[GOV-8 app] clicar de novo em "Contratar equipe sugerida" não contrata a equipe em duplicata', async () => {
    const before = await railTeamCount(s.page)
    await openStructureAssistant(s.page)
    await assistantToPreview(s.page, 'Agência')
    await s.page.getByRole('button', { name: 'Contratar equipe sugerida' }).click()
    await s.page.waitForTimeout(3_000)
    expect(await railTeamCount(s.page), 'contratou a equipe de novo').toBe(before)
    await leaveAssistant(s.page)
  }, 180_000)

  vitestIt('[GOV-3 app] Saúde: nota + Teste dos 2 dias com UMA linha por persona e legenda; "Simular de novo" não quebra', async () => {
    const health = await panelHealth(s, 'team-health')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    expect(health.blank, health.detail).toBe(false)
    const text = await mainText(s.page)
    expect(text).toContain('Teste dos 2 dias')
    expect(text).toMatch(/DIA 1 · MANHÃ/u)
    for (const legend of ['Continua andando', 'Espera aprovação', 'Para']) expect(text).toContain(legend)
    for (const name of ['Coordenação', 'Atendimento', 'Criação', 'Mídia']) expect(text, `linha de ${name} no teste dos 2 dias`).toContain(name)
    await shootBothThemes(s.page, SUITE, 'gov-saude')
    const before = s.console.fatalCount()
    await s.page.getByRole('button', { name: 'Simular de novo' }).click()
    await s.page.waitForTimeout(1500)
    expect(s.console.fatalCount()).toBe(before)
    expect(await mainText(s.page)).toContain('DIA 2 · TARDE')
  }, 180_000)

  vitestIt('[GOV-2 app] a Saúde NÃO mostra "Atividade do Gestor de equipe" inventada (mock) numa instalação sem Gestor ativo', async () => {
    await panelHealth(s, 'team-health')
    const text = await mainText(s.page)
    expect(text).not.toMatch(/mudou 1 arquivo\(s\) e contratou 1 · 1 falhou|Pipoca · Designer|alocar Nina/u)
  }, 120_000)

  bug('Prism+Anvil', '[GOV-8 app] logo depois de "Contratar equipe sugerida" a Saúde NÃO fica em 0 com "Ninguém cobre Atendimento": o assistente promete rotina com dono e setor coberto, mas as personas contratadas não recebem setor/dono de rotina', async () => {
    await panelHealth(s, 'team-health')
    const text = await mainText(s.page)
    expect(text).not.toMatch(/Ninguém cobre/u)
    expect(text).not.toMatch(/não tem dono/u)
  }, 120_000)

  bug('Lumen+Forge', '[GOV-3 app] o Teste dos 2 dias e a Saúde mostram NOMES humanos de rotina, nunca ids internos (hoje: "initiative:m-dia", "initiative:cria-o"…)', async () => {
    await panelHealth(s, 'team-health')
    expect(await mainText(s.page)).not.toMatch(/initiative:[a-z0-9-]+/u)
  }, 120_000)

  vitestIt('[GOV-4 app] "Estou fora" sem substituto avisa que as decisões VÃO ESPERAR; desligar volta ao normal', async () => {
    const away = () => s.page.getByRole('switch', { name: 'Estou fora' })
    await s.page.getByRole('button', { name: 'Conectado' }).first().click()
    await away().click()
    try {
      expect(await away().getAttribute('aria-checked')).toBe('true')
      await s.page.getByText('Ninguém foi definido para aprovar por você. As decisões vão esperar.').first().waitFor({ state: 'visible', timeout: 15_000 })
      expect(await s.page.getByRole('button', { name: 'Definir substituto' }).count(), 'ação para resolver o aviso').toBeGreaterThan(0)
      await shootBothThemes(s.page, SUITE, 'gov-fora-sem-substituto')
      // Esc and click-outside do not close the popover, which also covers the nav (F5 bug test below): use the status chip.
      await s.page.getByRole('button', { name: /Fora até/u }).first().click()
      await away().waitFor({ state: 'detached', timeout: 10_000 })
    } finally {
      if (await away().count() === 0) await s.page.getByRole('button', { name: /Fora até|Conectado/u }).first().click().catch(() => {})
      if (await away().getAttribute('aria-checked').catch(() => 'false') === 'true') await away().click()
      if (await away().count() > 0) await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click().catch(() => {})
    }
    await s.page.getByRole('button', { name: /^Conectado/u }).first().waitFor({ state: 'visible', timeout: 15_000 })
  }, 180_000)

  bug('Prism+Anvil', '[GOV-4 app] marcar "Estou fora" CHEGA ao host: o organograma passa a mostrar o selo "Fora" (hoje o estado é só do cliente — setAvailability nunca é chamado pelo shell)', async () => {
    const away = () => s.page.getByRole('switch', { name: 'Estou fora' })
    await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click()
    await away().click()
    try {
      await s.page.getByRole('button', { name: /Fora até/u }).first().click()
      await panelHealth(s, 'org-chart')
      expect(await mainText(s.page), 'selo "Fora" no organograma').toMatch(/Fora/u)
    } finally {
      await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click().catch(() => {})
      if (await away().getAttribute('aria-checked').catch(() => 'false') === 'true') await away().click().catch(() => {})
      if (await away().count() > 0) await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click().catch(() => {})
    }
  }, 120_000)

  bug('Prism', '[F5 app] a janela "Estou fora" fecha com Esc (padrão de popover; hoje fica aberta e só o clique fora fecha)', async () => {
    const away = () => s.page.getByRole('switch', { name: 'Estou fora' })
    await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click()
    await away().waitFor({ state: 'visible', timeout: 15_000 })
    await s.page.keyboard.press('Escape')
    await s.page.waitForTimeout(500)
    const open = await away().count()
    await s.page.mouse.click(900, 70)
    await s.page.waitForTimeout(300)
    const afterOutside = await away().count()
    if (afterOutside > 0) await s.page.getByRole('button', { name: /Conectado|Fora até/u }).first().click()
    expect(open + afterOutside, 'o popover continuou aberto depois do Esc e do clique fora').toBe(0)
  }, 60_000)

  vitestIt('[GOV-10 app] gates: cada tela de governança fecha sem fatais de console, sem tela em branco/carregando preso e sem violação de axe crítica/séria', async () => {
    for (const slug of ['org-chart', 'team-health']) {
      const health = await panelHealth(s, slug)
      expect(health.fatals, slug).toEqual([])
      expect(health.stuck, `${slug} ${health.detail}`).toBe(false)
      expect(health.blank, `${slug} ${health.detail}`).toBe(false)
      expect(health.axe.skipped, `axe não rodou em ${slug}: ${health.axe.reason ?? ''}`).toBe(false)
      expect(blockingAxe(health.axe).join(' || '), `${slug} axe crítico/sério`).toBe('')
    }
  }, 180_000)

  bug('Prism+Lumen', '[F5 app] as telas de governança têm UM landmark <main> e todo o conteúdo dentro de landmarks (axe landmark-one-main + region; moderado, vale p/ o shell inteiro)', async () => {
    for (const slug of ['org-chart', 'team-health']) {
      const health = await panelHealth(s, slug)
      expect(advisoryAxe(health.axe).filter(row => /^(landmark-one-main|region)/u.test(row)).join(' || '), slug).toBe('')
    }
  }, 180_000)
})
