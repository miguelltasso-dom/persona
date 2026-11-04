/**
 * BYC-6 + W2-11 — APP layer (real `persona` profile in Chrome, fake CLIs, 0 AI): the BRING-YOUR-CONTEXT.md and WAVE2.md
 * acceptance as a person sees it. Seeds that the UI cannot make yet go through the host Remote (same origin, same auth).
 * Host-level contracts: {@link ./mandatory-bring-your-context-host.spec.ts}, {@link ./mandatory-wave2-host.spec.ts}.
 * Run: PERSONA_E2E=1 under `with-lock` (one host). `GAUGE_HOST_URL` reuses a running host (development only).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it as vitestIt } from 'vitest'
import { bringContextPrompt } from '@deepseek-ai/dsh-persona-core'
import { createVaultFixture, readBringFixture } from '../src/bring-context-fixtures.ts'
import {
  captureDir,
  mainText,
  hireSuggestedTeam,
  openGaugeSession,
  panelHealth,
  shootBothThemes,
  type GaugeSession,
} from '../src/gauge-app.ts'
import { bycBlock, hostRpc, installDesktopPicker, reviewRow, splitAxe, uniquePaste } from '../src/gauge-byc-w2.ts'
import { TEACH_CONSENT } from '../../persona-host/src/wave2.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { onboarding as onboardingCopy } from '../src/real-app-locale.pt.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'byc-w2'
const TAG = `g${Date.now().toString(36)}`

/** Known product bug: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 120_000): void {
  // GAUGE_BUGS_AS_TESTS=1 runs them as plain tests, to read WHY each one fails (triage) or to confirm a fix.
  if (process.env.GAUGE_BUGS_AS_TESTS === '1') vitestIt(`[BUG→${owner}] ${title}`, fn, timeout)
  else vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

async function openImportadores(s: GaugeSession): Promise<void> {
  // A failed earlier test may have left the review screen open: go through the home so the page remounts clean.
  await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(p => p.slug === 'visao-geral')!)
  const health = await panelHealth(s, 'importar')
  expect(health.fatals, 'fatais de console em Importadores').toEqual([])
  await bycBlock(s.page).waitFor({ state: 'visible', timeout: 30_000 })
}

async function fillAndOrganize(s: GaugeSession, text: string): Promise<void> {
  const block = bycBlock(s.page)
  await block.locator('textarea').fill(text)
  await block.getByRole('button', { name: 'Adicionar resposta' }).click()
  await block.getByRole('button', { name: 'Organizar' }).click()
  await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'visible', timeout: 30_000 })
}

describe.skipIf(!run)('BYC-6 app — Importadores: pedido, colagem, revisão e Cofre', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    await s.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  vitestIt('[BYC-1b app] Importadores mostra o bloco "Traga o que suas IAs já sabem" (pedido, colagem, pasta, privacidade) sem tela em branco nem carregamento preso', async () => {
    const health = await panelHealth(s, 'importar')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    expect(health.blank, health.detail).toBe(false)
    const text = await mainText(s.page)
    for (const part of ['Traga o que suas IAs já sabem', 'Copie este pedido', 'Cole a resposta', 'Ou arraste a pasta do seu Obsidian', 'Tudo fica neste computador']) {
      expect(text, part).toContain(part)
    }
    expect(await bycBlock(s.page).getByRole('button', { name: 'Copiar pedido' }).count()).toBe(1)
    await shootBothThemes(s.page, SUITE, 'byc-importadores')
  }, 180_000)

  vitestIt('[BYC-1c app] abas ChatGPT/Claude/Gemini/Outra só mudam a dica; o pedido é o MESMO texto em todas e é o prompt oficial', async () => {
    await openImportadores(s)
    const block = bycBlock(s.page)
    const hints = new Map<string, string>()
    const shown = new Set<string>()
    for (const tab of ['ChatGPT', 'Claude', 'Gemini', 'Outra']) {
      await block.getByRole('tab', { name: tab }).click()
      expect(await block.getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true')
      hints.set(tab, await block.getByRole('tabpanel').innerText())
      shown.add(await block.locator('p, pre').filter({ hasText: 'Quero levar o que você sabe' }).first().innerText())
    }
    expect(new Set(hints.values()).size, 'cada aba tem a sua dica').toBe(4)
    expect(shown.size, 'o texto do pedido muda entre abas').toBe(1)
    await block.getByRole('tab', { name: 'ChatGPT' }).click()
    await block.getByRole('button', { name: 'Copiar pedido' }).click()
    await expect.poll(async () => (await block.getByRole('status').innerText().catch(() => '')), { timeout: 10_000 }).toMatch(/Copiado/u)
    const copied = await s.page.evaluate(() => navigator.clipboard.readText())
    expect(copied.replace(/\r\n/gu, '\n').trim()).toBe(bringContextPrompt('pt').trim())
  }, 180_000)

  vitestIt('[BYC-2 app] colar a resposta → Organizar: tipos certos, proveniência, (incerto) destacado, CPF e cartão bloqueados SEM botão de aceitar', async () => {
    await openImportadores(s)
    await fillAndOrganize(s, readBringFixture('paste-chatgpt.md'))
    const text = await s.page.locator('body').innerText()
    for (const kind of ['Sobre você e a empresa', 'Regras', 'Decisões', 'Memória']) expect(text, `grupo ${kind}`).toContain(kind)
    expect(text).toMatch(/colado do ChatGPT em \d{2}\/\d{2}/u)
    const uncertain = reviewRow(s.page, 'site de encomendas')
    expect(await uncertain.getByText('incerto', { exact: true }).count(), 'chip (incerto) na linha incerta').toBeGreaterThan(0)
    for (const [needle, why] of [['CPF 123.456.789-00', /CPF/u], ['4111 1111 1111 1111', /cartão/u]] as const) {
      const row = reviewRow(s.page, needle)
      expect(await row.innerText(), `${needle} bloqueado`).toMatch(why)
      expect(await row.innerText()).toMatch(/Bloqueado:/u)
      expect(await row.getByRole('button', { name: 'Aceitar', exact: true }).count(), `${needle}: sem botão Aceitar`).toBe(0)
    }
    expect(text).toMatch(/\d+ aceitos · \d+ pedem atenção · \d+ descartados/u)
    await shootBothThemes(s.page, SUITE, 'byc-revisao')
    await s.page.getByRole('button', { name: 'Voltar' }).click()
  }, 180_000)

  vitestIt('[BYC-4a app] aceitar grava, descartar não grava, editar grava o texto editado, bloqueado nunca vai; o que gravou aparece no Cofre', async () => {
    await openImportadores(s)
    const unique = uniquePaste(TAG)
    await fillAndOrganize(s, unique.text)
    const ruleRow = reviewRow(s.page, unique.lines.rule)
    const ruleAccept = ruleRow.getByRole('button', { name: 'Aceitar', exact: true })
    await reviewRow(s.page, unique.lines.person).getByRole('button', { name: 'Descartar' }).click()
    const toEdit = reviewRow(s.page, unique.lines.tool)
    await toEdit.getByRole('button', { name: 'Editar' }).click()
    await s.page.locator('li[data-decision] textarea, li[data-decision] input[type="text"]').first().fill(`Usa a planilha EDITADA ${TAG}.`)
    await s.page.locator('li[data-decision]').getByRole('button', { name: 'Pronto' }).first().click()
    await shootBothThemes(s.page, SUITE, 'byc-revisao-decisoes')
    const save = s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u })
    if (await ruleAccept.getAttribute('aria-pressed') !== 'true') await ruleAccept.click()
    expect(await ruleAccept.getAttribute('aria-pressed'), 'a regra está aceita (explícita ou por padrão)').toBe('true')
    const toSave = Number(/(\d+)/u.exec(await save.innerText())?.[1] ?? '0')
    expect(toSave, 'itens a gravar').toBeGreaterThanOrEqual(6)
    await save.click()
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'detached', timeout: 30_000 })
    // Authoritative check on the host (the Cofre screen lists every record and grows with each run) ...
    const rows = await hostRpc<{ body: string; kind: string }[]>(s.page, 'listVaultRecords')
    const mine = rows.filter(row => row.body.includes(TAG))
    const bodies = mine.map(row => row.body).join('\n')
    expect(bodies, 'aceito grava').toContain(unique.lines.company)
    expect(mine.find(row => row.body.includes(unique.lines.rule))?.kind, 'regra aceita grava como constraint').toBe('constraint')
    expect(bodies, 'editado grava o texto editado').toContain(`Usa a planilha EDITADA ${TAG}.`)
    expect(bodies, 'o original editado não grava').not.toContain(unique.lines.tool)
    expect(bodies, 'descartado não grava').not.toContain(unique.lines.person)
    expect(bodies, 'CPF nunca grava').not.toMatch(/987\.654\.321-00/u)
    expect(bodies, 'cartão nunca grava').not.toMatch(/5555 4444 3333 2222/u)
    // ... and the person sees it in Conhecimento (search by the unique word).
    await panelHealth(s, 'conhecimento')
    await s.page.getByPlaceholder('Buscar no cofre…').fill(unique.lines.company.slice(0, 40))
    await s.page.waitForTimeout(1_000)
    expect(await mainText(s.page), 'o item aceito aparece na tela do Cofre').toContain(unique.lines.company)
    await shootBothThemes(s.page, SUITE, 'byc-cofre-depois')
  }, 240_000)

  vitestIt('[BYC-4a app] duas regras DIFERENTES que começam igual (mesma posição, mesmos 40 primeiros caracteres) são gravadas AS DUAS (corrigido)', async () => {
    await openImportadores(s)
    // The shared head is > 40 chars and starts with the run tag, so only A vs B can collide (not earlier runs).
    const head = `Regra ${TAG} nunca enviar proposta comercial sem revisão do jurídico`
    const first = `${head} do cliente Alfa.`
    const second = `${head} do cliente Beta.`
    for (const rule of [first, second]) {
      await fillAndOrganize(s, `## Regras e restrições\n- ${rule}\n`)
      // Rules arrive pending (Muse): the explicit accept is "Aceitar todas as regras" (absent on older bundles).
      const acceptAll = s.page.getByRole('button', { name: /^Aceitar todas as regras/u })
      if (await acceptAll.count() > 0) await acceptAll.click()
      await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
      await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'detached', timeout: 30_000 })
    }
    const rows = await hostRpc<{ body: string }[]>(s.page, 'listVaultRecords')
    const bodies = rows.map(row => row.body)
    expect(bodies.some(body => body.includes(first)), 'regra A gravada').toBe(true)
    expect(bodies.some(body => body.includes(second)), 'regra B gravada (colidiu com a A e sumiu)').toBe(true)
  }, 240_000)

  vitestIt('[BYC-4d app] REGRAS chegam NÃO aceitas na revisão (decisão da Muse): o grupo tem "Aceitar todas as regras (n)", o Gravar mostra "Falta n regra(s) para você escolher" e a regra sem escolha NUNCA é gravada; decisões e fatos continuam pré-aceitos — entra no app com o próximo bundle exclusivo do Lumen (corrigido)', async () => {
    await openImportadores(s)
    const unique = uniquePaste(`${TAG}d`)
    await fillAndOrganize(s, unique.text)
    const rule = reviewRow(s.page, unique.lines.rule)
    expect(await rule.getByRole('button', { name: 'Aceitar', exact: true }).getAttribute('aria-pressed'), 'regra pendente (não aceita)').toBe('false')
    expect(await rule.getByRole('button', { name: 'Descartar' }).getAttribute('aria-pressed'), 'regra pendente (não descartada por padrão)').toBe('false')
    expect(await reviewRow(s.page, unique.lines.decision).getByRole('button', { name: 'Aceitar', exact: true }).getAttribute('aria-pressed'), 'decisão continua pré-aceita').toBe('true')
    expect(await reviewRow(s.page, unique.lines.company).getByRole('button', { name: 'Aceitar', exact: true }).getAttribute('aria-pressed'), 'fato continua pré-aceito').toBe('true')
    const acceptAll = s.page.getByRole('button', { name: /^Aceitar todas as regras \(\d+\)$/u })
    expect(await acceptAll.count(), 'botão "Aceitar todas as regras (n)"').toBe(1)
    expect(await s.page.locator('body').innerText(), 'aviso de regra pendente').toMatch(/Falta(m)? \d+ regras? para você escolher/u)
    const save = s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u })
    expect(await save.isEnabled(), 'Gravar continua habilitado').toBe(true)
    await shootBothThemes(s.page, SUITE, 'byc-revisao-regras-pendentes')
    // Saving without choosing the rule: facts/decisions go, the rule never does.
    await save.click()
    await save.waitFor({ state: 'detached', timeout: 30_000 })
    const rows = await hostRpc<{ body: string; kind: string }[]>(s.page, 'listVaultRecords')
    const mine = rows.filter(row => row.body.includes(`${TAG}d`))
    expect(mine.some(row => row.body.includes(unique.lines.company)), 'o fato aceito grava').toBe(true)
    expect(mine.some(row => row.body.includes(unique.lines.rule)), 'a regra sem escolha NÃO grava').toBe(false)
    // "Aceitar todas as regras" is the explicit accept: the rule is then written as a constraint.
    const second = uniquePaste(`${TAG}e`)
    await fillAndOrganize(s, second.text)
    await s.page.getByRole('button', { name: /^Aceitar todas as regras \(\d+\)$/u }).click()
    expect(await reviewRow(s.page, second.lines.rule).getByRole('button', { name: 'Aceitar', exact: true }).getAttribute('aria-pressed')).toBe('true')
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'detached', timeout: 30_000 })
    const after = await hostRpc<{ body: string; kind: string }[]>(s.page, 'listVaultRecords')
    expect(after.find(row => row.body.includes(second.lines.rule))?.kind, 'a regra explicitamente aceita grava como constraint').toBe('constraint')
  }, 240_000)

  vitestIt('[BYC-4b app] "Só para mim" grava como privado do autor (aparece para o dono) — outro membro: coberto no host', async () => {
    await openImportadores(s)
    const unique = uniquePaste(`${TAG}p`)
    await fillAndOrganize(s, unique.text)
    await reviewRow(s.page, unique.lines.decision).getByLabel('Só para mim').check()
    expect(await reviewRow(s.page, unique.lines.decision).getByLabel('Só para mim').isChecked()).toBe(true)
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'detached', timeout: 30_000 })
    const records = await hostRpc<{ body: string; id: string }[]>(s.page, 'listVaultRecords')
    expect(records.some(row => row.body.includes(unique.lines.decision)), 'o dono vê o item privado').toBe(true)
  }, 180_000)

  vitestIt('[BYC-4a app] depois de "Gravar N no Cofre" a tela CONFIRMA (ex.: "N itens no Cofre ✓" + atalho "ver")', async () => {
    await openImportadores(s)
    const unique = uniquePaste(`${TAG}c`)
    await fillAndOrganize(s, unique.text)
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'detached', timeout: 30_000 })
    await s.page.getByText(/itens? no Cofre|gravad/iu).first().waitFor({ state: 'visible', timeout: 5_000 })
  }, 120_000)

  vitestIt('[BYC-3c app] no web puro (sem app instalado) o botão "Escolher pasta" NÃO aparece e a área de arrastar continua explicando o que é lido', async () => {
    await openImportadores(s)
    const block = bycBlock(s.page)
    expect(await block.getByRole('button', { name: 'Escolher pasta' }).count()).toBe(0)
    expect(await block.innerText()).toMatch(/Lemos só arquivos \.md\. Ignoramos a pasta \.obsidian/u)
  }, 120_000)

  vitestIt('[BYC-1b app] Importadores fecha a matriz de acessibilidade: nada serious/critical (best-practice listado)', async () => {
    const health = await panelHealth(s, 'importar')
    const axe = splitAxe(health.axe)
    const dir = await captureDir(SUITE)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'axe-importar.json'), JSON.stringify(axe, null, 2), 'utf8')
    if (health.axe.skipped) console.warn(`[gauge] axe indisponível: ${health.axe.reason ?? ''}`)
    expect(axe.blockers.join(' || ')).toBe('')
  }, 120_000)
})

describe.skipIf(!run)('BYC-3 app — pasta do vault pelo seletor do app instalado (ponte `personaDesktop.pickDirectory`)', () => {
  let s: GaugeSession
  const vault = createVaultFixture()

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    // Init scripts added to the context apply to the next navigation: reload so the app boots WITH the bridge.
    await installDesktopPicker(s.page.context(), vault.root)
    await s.page.reload({ waitUntil: 'load' })
    await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await s.page.waitForTimeout(2_000)
  }, 420_000)

  afterAll(async () => {
    await s?.close()
    vault.cleanup()
  }, 60_000)

  vitestIt('[BYC-3 app] "Escolher pasta" lê o vault UMA vez: mostra "3 notas de <pasta>" e "N ignorados", sem laço de leituras, e a revisão só traz .md com proveniência "vault: caminho"', async () => {
    await openImportadores(s)
    const block = bycBlock(s.page)
    await block.getByRole('button', { name: 'Escolher pasta' }).click()
    await s.page.waitForTimeout(4_000)
    const text = await block.innerText()
    expect(text, 'a leitura terminou').toMatch(/3 notas de /u)
    expect(text).toMatch(/\d+ ignorados/u)
    expect(s.console.fatals().join(' | '), 'rajada de leituras do vault').not.toMatch(/ERR_INSUFFICIENT_RESOURCES/u)
    await block.getByRole('button', { name: 'Organizar' }).click()
    await s.page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).waitFor({ state: 'visible', timeout: 30_000 })
    const body = await s.page.locator('body').innerText()
    expect(body, 'proveniência da nota do vault na revisão').toMatch(/(vault: |de )notas\/clientes\.md/u)
    expect(body).not.toMatch(/Rascunho velho|logo\.png|contrato\.pdf/u)
  }, 180_000)
})

const STREAM = { streamKind: 'channel', ownerId: 'geral' } as const
const SUBJECTS = [['Interface', 1], ['Preços', 2], ['Entregas', 3]] as const

interface SubjectsBundle { subjects: { id: string; name: string; unreadCount: number; colorIndex: number }[]; activeSubjectId: string }

/** Seed the 3 colored assuntos through the host (the "+" button of the bar is broken, see the BUG test below). */
async function seedSubjects(s: GaugeSession): Promise<void> {
  const have = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
  const keep = new Set(['Geral', ...SUBJECTS.map(row => row[0])])
  for (const row of have.subjects) if (!keep.has(row.name)) await hostRpc(s.page, 'archiveConversationSubject', { ...STREAM, subjectId: row.id }).catch(() => {})
  for (const [name, colorIndex] of SUBJECTS) {
    if (!have.subjects.some(row => row.name === name)) await hostRpc(s.page, 'createConversationSubject', { ...STREAM, name, colorIndex })
  }
  const tidy = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
  const geral = tidy.subjects.find(row => row.name === 'Geral')
  if (geral !== undefined) await hostRpc(s.page, 'setActiveConversationSubject', { ...STREAM, subjectId: geral.id })
  await s.page.reload({ waitUntil: 'load' })
  await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  await s.page.waitForTimeout(2_000)
}

/** First line of a chip's text = the assunto name (unread chips add a count and an sr-only sentence). */
const chipName = (text: string): string => (text.split('\n')[0] ?? '').trim()

const subjectBar = (s: GaugeSession) => s.page.getByRole('tablist', { name: 'Assuntos desta conversa' })

async function openGeral(s: GaugeSession): Promise<void> {
  await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(p => p.slug === 'geral')!)
  await subjectBar(s).waitFor({ state: 'visible', timeout: 30_000 })
}

async function selectedSubject(s: GaugeSession): Promise<string> {
  return chipName(await subjectBar(s).getByRole('tab', { selected: true }).first().innerText())
}

describe.skipIf(!run)('W2-1 app — assuntos coloridos no #geral', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    await hireSuggestedTeam(s.page) // a fresh own host has the BLANK team: hire the suggested one like a user does
    await seedSubjects(s)
  }, 420_000)

  afterAll(async () => {
    if (s !== undefined) {
      // Leave the shared host tidy: archive leftovers and make Geral the active assunto again.
      const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM).catch(() => undefined)
      for (const row of bundle?.subjects ?? []) if (/^Temp /u.test(row.name)) await hostRpc(s.page, 'archiveConversationSubject', { ...STREAM, subjectId: row.id }).catch(() => {})
      const geral = bundle?.subjects.find(row => row.name === 'Geral')
      if (geral !== undefined) await hostRpc(s.page, 'setActiveConversationSubject', { ...STREAM, subjectId: geral.id }).catch(() => {})
    }
    await s?.close()
  }, 60_000)

  vitestIt('[W2-1a app] 3 assuntos + Geral: cada chip tem COR e NOME (nunca só cor), o ativo é aria-selected e há um único tab no Tab (roving)', async () => {
    await openGeral(s)
    const tabs = subjectBar(s).getByRole('tab')
    const names = (await tabs.allInnerTexts()).map(chipName)
    for (const name of ['Geral', ...SUBJECTS.map(row => row[0])]) expect(names, `chip ${name}`).toContain(name)
    for (const label of await tabs.all()) {
      expect((await label.innerText()).trim().length, 'chip só com cor').toBeGreaterThan(0)
      expect(await label.getAttribute('title')).toBe(chipName(await label.innerText()))
      expect(await label.locator('[aria-hidden="true"]').count(), 'ponto de cor decorativo (aria-hidden)').toBeGreaterThan(0)
    }
    expect(await subjectBar(s).getByRole('tab', { selected: true }).count()).toBe(1)
    const tabbable = await tabs.evaluateAll(els => els.filter(el => el.getAttribute('tabindex') === '0').length)
    expect(tabbable, 'roving tabindex: um só chip no Tab').toBe(1)
    const colors = await tabs.evaluateAll(els => els.map(el => getComputedStyle(el.querySelector('span') as Element).backgroundColor))
    expect(new Set(colors).size, 'cores distintas por assunto').toBe(colors.length)
    await shootBothThemes(s.page, SUITE, 'w2-assuntos-barra')
  }, 180_000)

  vitestIt('[W2-1e app] teclado: setas/Home/End movem entre chips (roving) e o assunto escolhido vira o ativo', async () => {
    await openGeral(s)
    const tabs = subjectBar(s).getByRole('tab')
    await tabs.first().focus()
    const focused = async (): Promise<string> => chipName(await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText ?? ''))
    expect(await focused()).toBe('Geral')
    await s.page.keyboard.press('ArrowRight')
    expect(await focused()).toBe('Interface')
    await s.page.keyboard.press('End')
    expect(await focused()).toBe('Entregas')
    await s.page.keyboard.press('Home')
    expect(await focused()).toBe('Geral')
    await s.page.keyboard.press('ArrowRight')
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Interface')
    await s.page.keyboard.press('ArrowLeft')
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Geral')
  }, 120_000)

  vitestIt('[W2-1a app] históricos separados: uma mensagem do assunto Preços aparece só em Preços e continua lá depois de trocar de chip', async () => {
    await openGeral(s)
    const text = `Orçamento do assunto ${TAG}`
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const precos = bundle.subjects.find(row => row.name === 'Preços')!
    // The composer cannot send today (see the B8 BUG test below), so the message goes in through the host with the assunto set.
    await hostRpc(s.page, 'postMessage', { id: `gauge-msg-${TAG}`, ...STREAM, body: text, actorId: 'owner', subjectId: `s-m-${TAG}`, occurredAt: new Date().toISOString(), topicId: precos.id })
    await subjectBar(s).getByRole('tab', { name: /^Preços/u }).click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Preços')
    await s.page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    for (const other of ['Interface', 'Entregas', 'Geral']) {
      await subjectBar(s).getByRole('tab', { name: new RegExp(`^${other}`, 'u') }).click()
      await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe(other)
      await s.page.waitForTimeout(600)
      expect(await s.page.getByText(text, { exact: true }).count(), `a mensagem de Preços apareceu em ${other}`).toBe(0)
    }
    await subjectBar(s).getByRole('tab', { name: /^Preços/u }).click()
    await s.page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 })
    await shootBothThemes(s.page, SUITE, 'w2-assunto-precos')
  }, 240_000)

  vitestIt('[B8/W2 app] ENVIAR pela caixa de mensagem do #geral chega ao host (corrigido)', async () => {
    await openGeral(s)
    const text = `Caixa de mensagem ${TAG}`
    const box = s.page.locator('[data-persona-area="composer"] textarea')
    await box.fill(text)
    await box.press('Enter')
    await s.page.waitForTimeout(3_000)
    await s.page.screenshot({ path: join(await captureDir(SUITE), 'bug-composer-envio.png') })
    const events = await hostRpc<{ events: { body: string }[] }>(s.page, 'listMessages', { ...STREAM, actorId: 'owner', afterSeq: 0, limit: 200 })
    expect(events.events.some(row => row.body.includes(text)), 'a mensagem digitada não chegou ao host').toBe(true)
  }, 120_000)

  vitestIt('[W2-1b app] a RESPOSTA da persona aparece no mesmo assunto da pergunta (corrigido: antes nascia sem topicId)', async () => {
    await openGeral(s)
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const interface_ = bundle.subjects.find(row => row.name === 'Interface')!
    const question = `@Coordenação resuma ${TAG}r`
    await hostRpc(s.page, 'postMessage', { id: `gauge-q-${TAG}`, ...STREAM, body: question, actorId: 'owner', subjectId: `s-q-${TAG}`, occurredAt: new Date().toISOString(), topicId: interface_.id })
    type Page = { events: { id: string; actorId: string; topicId?: string; body: string }[] }
    const repliesIn = async (): Promise<Page['events']> => {
      const page = await hostRpc<Page>(s.page, 'listMessages', { ...STREAM, actorId: 'owner', afterSeq: 0, limit: 200, topicId: interface_.id })
      return page.events.filter(row => row.actorId !== 'owner' && row.actorId !== 'system')
    }
    try {
      await expect.poll(async () => (await repliesIn()).length, { timeout: 40_000, message: 'sem resposta da equipe no assunto Interface' }).toBeGreaterThan(0)
    } catch (error) {
      // Diagnosis: where did the reply go? (all topics of #geral, newest 10)
      const all = await hostRpc<Page>(s.page, 'listMessages', { ...STREAM, actorId: 'owner', afterSeq: 0, limit: 200 }).catch(() => ({ events: [] } as Page))
      console.log(`[gauge-diag] W2-1b assunto=${interface_.id} eventos: ${JSON.stringify(all.events.slice(-10).map(row => ({ id: row.id.slice(0, 28), actor: row.actorId, topic: row.topicId ?? '', body: row.body.slice(0, 50) })))}`)
      throw error
    }
  }, 120_000)

  bug('Lumen+Forge', '[W2-1d app] a Tarefa pedida no assunto Interface aparece no quadro com o NOME do assunto de origem no cartão (nunca só a cor)', async () => {
    await openGeral(s)
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const interface_ = bundle.subjects.find(row => row.name === 'Interface')!
    const ask = `preciso de um README sobre ${TAG}d`
    await hostRpc(s.page, 'postMessage', { id: `gauge-d-${TAG}`, ...STREAM, body: ask, actorId: 'owner', subjectId: `s-d-${TAG}`, occurredAt: new Date().toISOString(), topicId: interface_.id })
    await s.page.waitForTimeout(6_000)
    await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'kanban')!)
    const back = s.page.getByRole('button', { name: 'Voltar aos quadros' })
    if (await back.count() > 0) await back.first().click()
    await s.page.getByText('Pessoal', { exact: true }).first().click()
    await s.page.getByRole('button', { name: 'Editar fluxo' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const card = s.page.getByText(new RegExp(`README sobre ${TAG}d`, 'u')).first()
    await card.waitFor({ state: 'visible', timeout: 30_000 })
    // Walk up from the card title to the card root (the smallest ancestor that also shows the origin assunto).
    const cardText = await card.evaluate((node) => {
      let current: HTMLElement | null = node as HTMLElement
      for (let depth = 0; depth < 5 && current !== null; depth += 1) {
        if ((current.textContent ?? '').includes('Interface')) return current.textContent ?? ''
        current = current.parentElement
      }
      return (node as HTMLElement).textContent ?? ''
    })
    expect(cardText, 'o cartão não diz de qual assunto veio').toMatch(/Interface/u)
    await shootBothThemes(s.page, SUITE, 'w2-quadro-cartao-assunto-origem')
  }, 120_000)

  vitestIt('[W2-1b app] não lido por assunto: cada chip com mensagens novas mostra "N não lidas neste assunto" (texto, não só cor) com N igual ao do host, e os sem novidade ficam só com o nome', async () => {
    await s.page.reload({ waitUntil: 'load' })
    await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await openGeral(s)
    await subjectBar(s).getByRole('tab', { name: /^Geral/u }).click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Geral')
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    for (const row of bundle.subjects) {
      const text = (await subjectBar(s).getByRole('tab', { name: new RegExp(`^${row.name}`, 'u') }).innerText()).replace(/\s+/gu, ' ').trim()
      if (row.unreadCount > 0 && row.name !== 'Geral') expect(text, `${row.name} (host: ${String(row.unreadCount)})`).toContain(`${String(row.unreadCount)} não lidas neste assunto`)
      else if (row.unreadCount === 0) expect(text, `${row.name} sem novidade`).toBe(row.name)
    }
    await shootBothThemes(s.page, SUITE, 'w2-assunto-nao-lido')
  }, 240_000)

  bug('Prism', '[W2-1b app] o número do chip acompanha o host AO VIVO: uma mensagem nova da equipe num assunto que já tinha não lidas atualiza o chip sem recarregar (hoje o chip fica parado: host=6, chip=5 depois de 20 s)', async () => {
    await openGeral(s)
    await subjectBar(s).getByRole('tab', { name: /^Geral/u }).click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Geral')
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const interface_ = bundle.subjects.find(row => row.name === 'Interface')!
    const team = await hostRpc<{ personas: { id: string }[] }>(s.page, 'listTeam', {})
    await hostRpc(s.page, 'postMessage', { id: `gauge-live-${TAG}`, ...STREAM, body: `Mensagem ao vivo ${TAG}`, actorId: team.personas[0]!.id, subjectId: 'live', occurredAt: new Date().toISOString(), topicId: interface_.id })
    const after = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const expected = after.subjects.find(row => row.name === 'Interface')!.unreadCount
    await expect.poll(async () => (await subjectBar(s).getByRole('tab', { name: /^Interface/u }).innerText()).replace(/\s+/gu, ' '), { timeout: 20_000 }).toContain(`${String(expected)} não lidas neste assunto`)
  }, 120_000)

  bug('Anvil', '[W2-1b app] a PRÓPRIA mensagem do usuário num assunto inativo NÃO conta como não lida (hoje listConversationSubjects soma +1 quando o autor é o dono)', async () => {
    await openGeral(s)
    const read = async (): Promise<number> => (await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)).subjects.find(row => row.name === 'Preços')!.unreadCount
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const precos = bundle.subjects.find(row => row.name === 'Preços')!
    const before = await read()
    await hostRpc(s.page, 'postMessage', { id: `gauge-own-${TAG}`, ...STREAM, body: `Minha própria nota ${TAG}`, actorId: 'owner', subjectId: 'owner', occurredAt: new Date().toISOString(), topicId: precos.id })
    await s.page.waitForTimeout(1_500)
    expect(await read(), 'a própria mensagem virou não lida').toBe(before)
  }, 120_000)

  bug('Anvil+Prism', '[W2-1b app] abrir o assunto MARCA como lido de verdade: hoje o chip só esconde a bolinha enquanto está selecionado — o host continua com unreadCount>0 e a bolinha volta ao sair do assunto', async () => {
    await openGeral(s)
    const tab = (name: string) => subjectBar(s).getByRole('tab', { name: new RegExp(`^${name}`, 'u') })
    await tab('Interface').click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Interface')
    await s.page.waitForTimeout(4_000)
    await tab('Geral').click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Geral')
    await s.page.waitForTimeout(4_000)
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    expect(bundle.subjects.find(row => row.name === 'Interface')!.unreadCount, 'não lido de Interface depois de abrir e sair').toBe(0)
    expect((await tab('Interface').innerText()).trim()).toBe('Interface')
  }, 120_000)

  vitestIt('[W2-1e app] menu do chip: Renomear e Arquivar assunto; arquivar pela UI PERSISTE no host (some do bundle) e o histórico continua legível', async () => {
    await openGeral(s)
    const name = `Temp ${TAG}`
    const have = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const free = [0, 1, 2, 3, 4, 5, 6].find(index => !have.subjects.some(row => row.colorIndex === index))
    expect(free, 'sem cor livre para o assunto temporário (limite de 7)').toBeDefined()
    const created = await hostRpc<SubjectsBundle>(s.page, 'createConversationSubject', { ...STREAM, name, colorIndex: free })
    const id = created.subjects.find(row => row.name === name)!.id
    await hostRpc(s.page, 'postMessage', { id: `gauge-temp-${TAG}`, ...STREAM, body: `Histórico ${TAG}`, actorId: 'owner', subjectId: `s-t-${TAG}`, occurredAt: new Date().toISOString(), topicId: id })
    await s.page.reload({ waitUntil: 'load' })
    await openGeral(s)
    await subjectBar(s).getByRole('tab', { name: new RegExp(`^Temp ${TAG}`, 'u') }).click()
    await expect.poll(async () => (await selectedSubject(s)).startsWith('Temp'), { timeout: 10_000 }).toBe(true)
    await s.page.getByRole('button', { name: new RegExp(`Mais ações para Temp ${TAG}`, 'u') }).click()
    expect(await s.page.getByRole('menuitem').allTextContents()).toEqual(expect.arrayContaining(['Renomear', 'Arquivar assunto']))
    await s.page.getByRole('menuitem', { name: 'Arquivar assunto' }).click()
    await expect.poll(async () => await subjectBar(s).getByRole('tab', { name: new RegExp(`^Temp ${TAG}`, 'u') }).count(), { timeout: 15_000 }).toBe(0)
    await expect.poll(async () => (await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)).subjects.some(row => row.id === id), { timeout: 15_000 }).toBe(false)
    const events = await hostRpc<{ events: { id: string }[] }>(s.page, 'listMessages', { ...STREAM, actorId: 'owner', afterSeq: 0, limit: 200, topicId: id })
    expect(events.events.map(row => row.id), 'histórico do assunto arquivado').toContain(`gauge-temp-${TAG}`)
  }, 240_000)

  bug('Anvil', '[W2-1e app] arquivar o assunto ATIVO deixa o host com activeSubjectId apontando para o arquivado: depois de recarregar NENHUM chip fica selecionado (listConversationSubjects só cai para o 1º quando não há valor guardado)', async () => {
    const have = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const free = [0, 1, 2, 3, 4, 5, 6].find(index => !have.subjects.some(row => row.colorIndex === index))
    expect(free, 'sem cor livre').toBeDefined()
    const name = `Temp ${TAG}a`
    const created = await hostRpc<SubjectsBundle>(s.page, 'createConversationSubject', { ...STREAM, name, colorIndex: free })
    const id = created.subjects.find(row => row.name === name)!.id
    await hostRpc(s.page, 'setActiveConversationSubject', { ...STREAM, subjectId: id })
    await hostRpc(s.page, 'archiveConversationSubject', { ...STREAM, subjectId: id })
    const geral = have.subjects.find(row => row.name === 'Geral')!
    try {
      const after = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
      expect(after.subjects.some(row => row.id === after.activeSubjectId), 'o assunto ativo existe entre os visíveis').toBe(true)
    } finally {
      await hostRpc(s.page, 'setActiveConversationSubject', { ...STREAM, subjectId: geral.id }).catch(() => {})
    }
  }, 120_000)

  vitestIt('[W2-1e app] cada mensagem oferece "Mover para outro assunto" (acessível por teclado)', async () => {
    await openGeral(s)
    await subjectBar(s).getByRole('tab', { name: 'Preços' }).click()
    await expect.poll(() => selectedSubject(s), { timeout: 10_000 }).toBe('Preços')
    const move = s.page.getByRole('button', { name: 'Mover para outro assunto' }).first()
    await move.waitFor({ state: 'attached', timeout: 15_000 })
    await move.focus()
    expect(await move.evaluate(el => document.activeElement === el), 'o botão recebe foco do teclado').toBe(true)
  }, 120_000)

  vitestIt('[W2-1a app] o botão "+" (Novo assunto) CRIA um assunto sem mostrar erro (corrigido pelo Prism: antes mandava name "" e falhava)', async () => {
    await openGeral(s)
    const before = await subjectBar(s).getByRole('tab').count()
    await s.page.getByRole('button', { name: 'Novo assunto' }).click()
    await s.page.waitForTimeout(2_500)
    await s.page.screenshot({ path: join(await captureDir(SUITE), 'w2-novo-assunto.png') })
    expect(await s.page.getByText('Não deu para carregar os assuntos agora.').count(), 'erro ao criar assunto').toBe(0)
    await expect.poll(async () => await subjectBar(s).getByRole('tab').count(), { timeout: 10_000 }).toBeGreaterThan(before)
    // Tidy: archive what the button created and give Geral back as the active assunto.
    const bundle = await hostRpc<SubjectsBundle>(s.page, 'listConversationSubjects', STREAM)
    const keep = new Set(['Geral', ...SUBJECTS.map(row => row[0])])
    for (const row of bundle.subjects) if (!keep.has(row.name)) await hostRpc(s.page, 'archiveConversationSubject', { ...STREAM, subjectId: row.id }).catch(() => {})
    const geral = bundle.subjects.find(row => row.name === 'Geral')
    if (geral !== undefined) await hostRpc(s.page, 'setActiveConversationSubject', { ...STREAM, subjectId: geral.id }).catch(() => {})
  }, 120_000)

  vitestIt('[W2-1 app] gates: o #geral com assuntos fecha sem fatais de console, sem tela presa e sem violação serious/critical de axe', async () => {
    const health = await panelHealth(s, 'geral')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    const axe = splitAxe(health.axe)
    const dir = await captureDir(SUITE)
    writeFileSync(join(dir, 'axe-geral.json'), JSON.stringify(axe, null, 2), 'utf8')
    expect(axe.blockers.join(' || ')).toBe('')
  }, 180_000)
})

interface AccountsBundle { accounts: { id: string; label: string; provider: string }[]; swapPolicy: string; swapPolicyScope: string }

const ACCOUNTS = ['Pessoal', 'Trabalho'] as const

describe.skipIf(!run)('W2-3 app — várias contas por provedor, política de troca e consumo', () => {
  let s: GaugeSession
  let originalPolicy = 'next_on_limit'

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    const have = await hostRpc<AccountsBundle>(s.page, 'listConnectionAccounts')
    originalPolicy = have.swapPolicy
    for (const label of ACCOUNTS) {
      if (!have.accounts.some(row => row.label === label && row.provider === 'claude')) await hostRpc(s.page, 'addConnectionAccount', { provider: 'claude', label })
    }
    await s.page.reload({ waitUntil: 'load' })
    await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await s.page.waitForTimeout(2_000)
  }, 420_000)

  afterAll(async () => {
    await hostRpc(s.page, 'setRunnerSwapPolicy', { policy: originalPolicy, scope: 'workspace' }).catch(() => {})
    await s?.close()
  }, 60_000)

  vitestIt('[W2-3a app] Conexões lista as 2 contas do mesmo provedor com os rótulos, cada uma com o seu estado, e o botão de adicionar outra', async () => {
    const health = await panelHealth(s, 'conexoes')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    const text = await mainText(s.page)
    const claude = text.slice(text.indexOf('Claude'))
    for (const label of ACCOUNTS) expect(claude, `conta ${label}`).toContain(label)
    expect(text).toContain('+ Adicionar outra conta Claude')
    expect(text).not.toMatch(/undefined|\[object|NaN/u)
    await shootBothThemes(s.page, SUITE, 'w2-conexoes-2-contas')
  }, 180_000)

  vitestIt('[W2-3b/c/d app] as 4 políticas existem; escolher "Dividir o uso" chega ao host e SOBREVIVE ao recarregar; "Perguntar" e "Fixa" também', async () => {
    await panelHealth(s, 'conexoes')
    const policies = [
      { name: /Uma conta fixa/u, host: 'fixed' },
      { name: /Perguntar antes de trocar/u, host: 'ask_before_swap' },
      { name: /Dividir o uso/u, host: 'round_robin' },
      { name: /Usar a próxima/u, host: 'next_on_limit' },
    ] as const
    const radioNames = await s.page.getByRole('radio').evaluateAll(els => els.map(el => (el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.parentElement?.textContent ?? '').trim().slice(0, 60)))
    expect(radioNames.length, `as 4 políticas (radios vistos: ${JSON.stringify(radioNames)})`).toBeGreaterThanOrEqual(4)
    for (const policy of policies) {
      await s.page.getByRole('radio', { name: policy.name }).check()
      await expect.poll(async () => (await hostRpc<AccountsBundle>(s.page, 'listConnectionAccounts')).swapPolicy, { timeout: 15_000 }).toBe(policy.host)
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await s.page.waitForTimeout(1_500)
      await panelHealth(s, 'conexoes')
      expect(await s.page.getByRole('radio', { name: policy.name }).isChecked(), `${policy.host} persistiu`).toBe(true)
    }
    await s.page.getByRole('radio', { name: /Dividir o uso/u }).check()
    await expect.poll(async () => (await hostRpc<AccountsBundle>(s.page, 'listConnectionAccounts')).swapPolicy, { timeout: 15_000 }).toBe('round_robin')
    await shootBothThemes(s.page, SUITE, 'w2-conexoes-politica-dividir')
  }, 300_000)

  vitestIt('[W2-3e app] o cartão da persona diz como o uso é dividido (política ativa) e Uso e limites abre sem erro', async () => {
    const perfil = { ...REAL_GALLERY_PANELS.find(p => p.slug === 'perfil')!, profileRailPersona: 'Coordenação' }
    await navigateGalleryPanel(s.page, perfil)
    await s.page.locator('[data-persona-surface="profile"]').waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(async () => await mainText(s.page), { timeout: 20_000 }).toMatch(/Divide o uso entre as contas/u)
    await shootBothThemes(s.page, SUITE, 'w2-cartao-politica')
    const health = await panelHealth(s, 'uso')
    expect(health.fatals).toEqual([])
    expect(health.stuck, health.detail).toBe(false)
    expect(await mainText(s.page)).toContain('Por persona')
  }, 180_000)

  vitestIt('[W2-3e app] "Por persona" em Uso e limites mostra o NOME da persona (corrigido pelo Lumen: antes mostrava o id interno, ex.: "onb-1")', async () => {
    await panelHealth(s, 'uso')
    const text = await mainText(s.page)
    const section = text.slice(text.indexOf('Por persona'), text.indexOf('Por tipo de trabalho'))
    expect(section, 'id interno na tela').not.toMatch(/\bonb-\d+\b|\bp-[a-z0-9]{6,}\b/u)
    await s.page.screenshot({ path: join(await captureDir(SUITE), 'bug-w2-uso-id-interno.png') })
  }, 120_000)
})

describe.skipIf(!run)('W2-2 app — Ensinar a persona: consentimento antes de gravar e nada ativa sozinho', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    await hireSuggestedTeam(s.page) // a fresh own host has the BLANK team: hire the suggested one like a user does
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  async function openEnsinar(): Promise<void> {
    const perfil = { ...REAL_GALLERY_PANELS.find(p => p.slug === 'perfil')!, profileRailPersona: 'Coordenação' }
    await navigateGalleryPanel(s.page, perfil)
    await s.page.locator('[data-persona-surface="profile"]').waitFor({ state: 'visible', timeout: 30_000 })
    await s.page.getByRole('button', { name: 'Ensinar' }).first().click()
    await s.page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  vitestIt('[W2-2d app] antes de gravar há um consentimento claro: o que é gravado, onde fica, quem vê, retenção e aviso de dados sensíveis; só começa pelo botão', async () => {
    await openEnsinar()
    const dialog = s.page.getByRole('dialog').first()
    const text = await dialog.innerText()
    for (const part of ['PASSO 1 DE 2', 'O que é gravado', 'Onde fica', 'Quem vê', 'Evite mostrar senhas', 'apagada em 30 dias', 'Nada sobe para a nuvem', 'Só vira skill depois que você revisar e aprovar']) {
      expect(text, part).toContain(part)
    }
    expect(await dialog.getByRole('button', { name: 'Cancelar' }).count()).toBe(1)
    expect(await dialog.getByRole('button', { name: 'Escolher o que gravar' }).count()).toBe(1)
    await shootBothThemes(s.page, SUITE, 'w2-ensinar-consentimento')
  }, 180_000)

  vitestIt('[W2-2a app] no web puro gravar fica DESLIGADO e honesto ("só funciona no app instalado"); Cancelar fecha sem criar nada', async () => {
    await openEnsinar()
    const dialog = s.page.getByRole('dialog').first()
    expect(await dialog.innerText()).toMatch(/só funciona no app instalado da Persona/u)
    expect(await dialog.getByRole('button', { name: 'Escolher o que gravar' }).isDisabled(), 'sem app instalado não grava').toBe(true)
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })
  }, 120_000)

  vitestIt('[W2-2c app] rascunho aceito vira skill CANDIDATA (aparece em Skills, não ativa) e "publicar para o time" sem confirmação é recusado', async () => {
    const team = await hostRpc<{ personas: { id: string; name: string }[] }>(s.page, 'listTeam', {})
    const nina = team.personas.find(row => row.name === 'Coordenação') ?? team.personas[0]!
    const start = await hostRpc<{ sessionId: string }>(s.page, 'startTeachSession', { personaId: nina.id, consentVersion: TEACH_CONSENT })
    await hostRpc(s.page, 'stopTeachSession', {
      sessionId: start.sessionId, includeMicrophone: false, transcript: `Abra o catálogo ${TAG} e publique.`,
      frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
    })
    const accepted = await hostRpc<{ id: string; status: string }>(s.page, 'acceptTaughtCandidate', { sessionId: start.sessionId })
    expect(accepted.status, 'nada ativa sozinho').toBe('candidate')
    await expect(hostRpc(s.page, 'publishTaughtSkill', { skillId: accepted.id, scope: 'team', explicit: false })).rejects.toThrow(/ACCESS_ESCALATION|forbidden/u)
    const perfil = { ...REAL_GALLERY_PANELS.find(p => p.slug === 'perfil')!, profileRailPersona: nina.name }
    await navigateGalleryPanel(s.page, perfil)
    await s.page.getByRole('tab', { name: 'Skills' }).click()
    await s.page.waitForTimeout(1_500)
    const skills = await mainText(s.page)
    await shootBothThemes(s.page, SUITE, 'w2-ensinar-skills')
    expect(skills, 'a skill ensinada aparece').toMatch(/Abra o catálogo|taught|ensinad/iu)
    expect(skills).toMatch(/candidata|rascunho|revis/iu)
  }, 240_000)

  vitestIt('[W2-2 app] gates: o perfil com Ensinar fecha sem fatais, sem tela presa e sem violação serious/critical de axe', async () => {
    const health = await panelHealth(s, 'perfil')
    expect(health.fatals).toEqual([])
    const axe = splitAxe(health.axe)
    writeFileSync(join(await captureDir(SUITE), 'axe-perfil.json'), JSON.stringify(axe, null, 2), 'utf8')
    expect(axe.blockers.join(' || ')).toBe('')
  }, 180_000)
})

describe.skipIf(!run || (process.env.GAUGE_HOST_URL ?? '') !== '')('BYC-1a app — onboarding passo 2 (home LIMPO; só roda com host próprio sob a trava)', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ onboard: false, viewport: { width: 1440, height: 900 } })
  }, 420_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  vitestIt('[BYC-1a app] passo 2 (Sobre a empresa): o bloco "Traga o que suas IAs já sabem" fica ABAIXO do campo de descrição, recolhido, com o selo de 2 min, e expande sem sair do passo', async () => {
    await s.page.getByPlaceholder(onboardingCopy.step1Placeholder).fill('Gauge BYC')
    await s.page.getByRole('button', { name: 'Continuar', exact: true }).click()
    const description = s.page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…')
    await description.waitFor({ state: 'visible', timeout: 30_000 })
    const teaser = s.page.getByRole('button', { name: /Já usa ChatGPT, Claude ou Gemini\? Traga o que eles sabem sobre você/u })
    await teaser.waitFor({ state: 'visible', timeout: 30_000 })
    const fieldBox = await description.boundingBox()
    const teaserBox = await teaser.boundingBox()
    expect(fieldBox !== null && teaserBox !== null && teaserBox.y >= fieldBox.y + fieldBox.height - 2, 'o bloco BYC vem DEPOIS (abaixo) do campo de descrição').toBe(true)
    expect(await teaser.getAttribute('aria-expanded')).toBe('false')
    await shootBothThemes(s.page, SUITE, 'byc-onboarding-passo2-recolhido')
    await teaser.click()
    await s.page.getByRole('heading', { name: 'Traga o que suas IAs já sabem' }).waitFor({ state: 'visible', timeout: 15_000 })
    for (const tab of ['ChatGPT', 'Claude', 'Gemini', 'Outra']) expect(await s.page.getByRole('tab', { name: tab }).count(), tab).toBeGreaterThan(0)
    expect(await s.page.getByRole('button', { name: 'Copiar pedido' }).count()).toBe(1)
    expect(await s.page.getByText('Tudo fica neste computador').count()).toBeGreaterThan(0)
    await shootBothThemes(s.page, SUITE, 'byc-onboarding-passo2-aberto')
  }, 240_000)
})
