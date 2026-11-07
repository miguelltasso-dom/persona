/**
 * E2E-V11 — EFF-1 (model + "Capricho" per persona) and HT-3 ("the person moves the card to Fazendo → the owner persona starts") on the real persona profile, web, fake
 * CLI, 0 AI. Contracts: `persona-spec/design/EFFORT-SPEC.md` (§4.1: the model as a LIST, the Capricho in full width BELOW it, "where the list came from" in words), `contracts/harness-tools.md` §8.
 * The host opt-in for HT-3 is `PERSONA_START_ON_BOARD=1` (Bolt, 05/11); the app passes no Config. The RUNNER side of EFF-1 (the argv), the HOST side (the menu of the engine)
 * and, since bundle 5 (Quill, 07/11), the SCREEN are delivered: Configurações › Personas has one chip per persona ("Sonnet · Caprichado") that opens "Trocar motor" with the Modelo
 * list and the Capricho segments; the chain UI → host → `--model/--effort` of the next turn is proven here. Opt-in `PERSONA_E2E=1`; one host per describe, ~3 min each.
 *
 * HT-3 (Bolt 07/11, host-only rule): a card that is delivered (no folder) or whose turn ended without delivering, moved to Fazendo, starts a NEW assignment — the stub answers a 2nd turn
 * and the typed line `board_card_move` says `started`; a result that waits for Aplicar/Descartar (project WITH a folder) is `held` with `reason: 'delivery_pending'` and no turn (that side
 * is covered by Bolt's host test `board-start.spec`; the harness has no project folder). The patch is in src since 07/11 12:53 (Bolt: "pode rodar"), so both HT-3 tests are plain tests.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { openV11Session, type V11Session } from '../src/v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type PersonaRow, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'
/** The words the screen uses for each level the host stores (EFFORT-SPEC §1); the raw id (`xhigh`) must never be on the screen. */
const EFFORT_WORDS: Readonly<Record<string, string>> = { low: 'Rápido', medium: 'Equilibrado', high: 'Caprichado', xhigh: 'Muito caprichado', max: 'Máximo' }
type Menu = { kind: string; models?: Array<{ id: string; label: string; effortLevels: string[] }>; defaultEffortLevels?: string[]; source?: 'cli' | 'static' }
/** What Bolt's new assignment says in its prompt when a card is moved to Fazendo (the stub logs whether the prompt held it, never the prompt). */
const MOVED_NEEDLE = 'Movi este cartão para Fazendo'

describe.skipIf(!run).sequential('V11 web — EFF-1 modelo + capricho por persona, HT-3 mover para Fazendo (fake)', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let creation: PersonaRow
  const scope = () => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })

  beforeAll(async () => {
    v11 = await openV11Session({ startOnBoard: true, engine: { turnMs: 1_500, needles: [MOVED_NEEDLE] } })
    tenant = await v11Tenant(v11.page)
    creation = (await personasOf(v11.page, tenant)).find(persona => persona.name === 'Criação')!
  }, 420_000)

  afterAll(async () => { await v11?.close() }, 60_000)

  it('EFF-1 host: the person picks a model and a Capricho for ONE persona; they are stored on her card and a persona with no choice keeps the engine default', async () => {
    // The persona view carries the engine NESTED (`engine: { runnerKind, runnerCli, runnerModel, runnerEffort }`, as `listPersonas` shows); older shapes had it flat — read both.
    type Engine = { runnerModel?: string | null; runnerEffort?: string | null }
    type View = Engine & { id?: string; engine?: Engine }
    const engineOf = (view: View): Engine => view.engine ?? view
    const card = await hostRpcOk<View>(v11.page, 'setPersonaEngine', {
      ...scope(), personaId: creation.id, runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'sonnet', runnerEffort: 'high',
    })
    expect(engineOf(card).runnerModel, JSON.stringify(card).slice(0, 300)).toBe('sonnet')
    expect(engineOf(card).runnerEffort).toBe('high')
    const mine = await hostRpcOk<Array<View & { id: string }>>(v11.page, 'listPersonas', scope())
    const other = mine.find(persona => persona.id !== creation.id)
    expect(other, 'there is another persona to compare with').toBeDefined()
    expect(engineOf(other!).runnerEffort ?? null, 'a persona nobody touched stays on "Padrão do motor"').toBeNull()
    expect(engineOf(mine.find(persona => persona.id === creation.id)!).runnerEffort, 'her choice survives a listing').toBe('high')
  }, 60_000)

  it('EFF-1 runner: the next turn of THAT persona asks the CLI for her model and Capricho (`--model sonnet --effort high`); the others do not', async () => {
    const before = v11.session.fakeCli.invocations().length
    await postAsPerson(v11.page, tenant, '@Criação escreva uma frase curta de abertura para o cartaz')
    const turn = await until(v11.page, async () => v11.session.fakeCli.invocations().slice(before).find(call => call.event === 'turn'), 60_000, 400)
    expect(turn, 'her turn ran').toBeDefined()
    const started = v11.session.fakeCli.invocations().slice(before).filter(call => call.event === 'invoke' && call.argv.includes('-p'))
    const argvs = started.map(call => call.argv.join(' '))
    expect(argvs.some(argv => /--model\s+sonnet/u.test(argv) && /--effort\s+high/u.test(argv)), `argv of her session: ${argvs.join(' | ')}`).toBe(true)
  }, 120_000)

  it('EFF-1 host: the models and levels a persona may choose come from the HOST (the screen never invents a level)', async () => {
    // The menu rides on the connection the host probes (`ConnectionView.models` / `defaultEffortLevels`, built from what the ENGINE reported). The fake CLI reports no
    // model menu (only the real claude does: installed layer), so here the claim is the shape: whatever the host lists is only the five known levels and carries no
    // "recommended" field; an engine that said nothing lists nothing (the screen then offers no choice — it never invents one).
    type Menu = { kind: string; models?: Array<{ id: string; label: string; effortLevels: string[] }>; defaultEffortLevels?: string[] }
    const connections = await hostRpcOk<Menu[]>(v11.page, 'listConnections', scope())
    const claude = connections.find(connection => connection.kind === 'claude')
    expect(claude, `listConnections lists claude (${connections.map(connection => connection.kind).join(', ')})`).toBeDefined()
    const known = ['low', 'medium', 'high', 'xhigh', 'max']
    for (const model of claude!.models ?? []) {
      expect(model.id).toBeTruthy()
      for (const level of model.effortLevels) expect(known, `level "${level}" of ${model.id}`).toContain(level)
      expect(model, 'no "recommended" field exists').not.toHaveProperty('recommended')
    }
    for (const level of claude!.defaultEffortLevels ?? []) expect(known).toContain(level)
  }, 30_000)

  /** Configurações › Personas (ON by default since v1.1): the engine chip of ONE persona. */
  const openSettingsPersonas = async (personaId: string): Promise<Locator> => {
    const { page } = v11
    await page.locator('[data-nav-place="settings"]').first().click()
    await page.locator('[role="tab"][data-tab-id="personas"]').first().click()
    const row = page.locator(`[data-persona-settings="personas"] li[data-persona-id="${personaId}"]`)
    await row.waitFor({ state: 'visible', timeout: 30_000 })
    return row.locator(`[data-persona-engine-trigger="${personaId}"]`)
  }
  const modelRadios = (page: Page): Locator => page.locator('[data-engine-block="model"] input[type="radio"]')
  const modelNames = async (page: Page): Promise<string[]> => (await modelRadios(page).evaluateAll(inputs => inputs.map(input => (input.closest('label')?.innerText ?? '').split('\n')[0]!.trim())))
  const effortNames = async (page: Page): Promise<string[]> => (await page.locator('[data-engine-block="effort"] [role="radio"]').allInnerTexts()).map(text => text.trim())
  const claudeMenu = async (): Promise<Menu> => {
    const connections = await hostRpcOk<Menu[]>(v11.page, 'listConnections', scope())
    const claude = connections.find(connection => connection.kind === 'claude')
    expect(claude, `listConnections lists claude (${connections.map(connection => connection.kind).join(', ')})`).toBeDefined()
    return claude!
  }

  it('[EFF-1 tela] Configurações › Personas: a chip per persona ("Sonnet · Caprichado" / "Padrão do motor") opens "Trocar motor" with the host\'s menu IN WORDS — the Modelo as a list and the Capricho in full width BELOW it, a line saying where the list came from', async () => {
    const { page } = v11
    const trigger = await openSettingsPersonas(creation.id)
    // The host test above stored sonnet/high for her: the row says it in words, and a persona nobody touched says "Padrão do motor".
    expect(await trigger.innerText(), 'her chip').toContain('Sonnet · Caprichado')
    expect(await trigger.getAttribute('aria-label')).toMatch(/Trocar modelo e capricho de Criação \(Sonnet · Caprichado\)/u)
    const others = page.locator('[data-persona-settings="personas"] li[data-persona-id] [data-persona-engine-trigger]')
    const chips = (await others.evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-persona-engine-trigger') ?? '', text: (node as HTMLElement).innerText.trim() }))))
    expect(chips.length, 'every persona of the team has an engine chip').toBeGreaterThanOrEqual(2)
    // Nobody else has a Capricho chosen: their chip is "Padrão do motor" or just a model name (the onboarding's own persona is bound to the logged CLI's model — "Haiku" — and says so).
    expect(chips.filter(chip => chip.id !== creation.id).every(chip => chip.text !== '' && !/ · /u.test(chip.text)), `nobody else has a Capricho: ${JSON.stringify(chips)}`).toBe(true)
    expect(chips.filter(chip => chip.id !== creation.id).some(chip => chip.text === 'Padrão do motor'), 'a persona nobody touched says "Padrão do motor"').toBe(true)

    await trigger.click()
    await page.locator('[data-engine-block="model"]').waitFor({ state: 'visible', timeout: 20_000 })
    const claude = await claudeMenu()
    // (1) the Modelo list = "Padrão do motor" + what the HOST says, in the host's order, with the model of her choice marked.
    expect(await modelNames(page), 'the model list is the host\'s menu').toEqual(['Padrão do motor', ...(claude.models ?? []).map(model => model.label)])
    const checked = await modelRadios(page).evaluateAll(inputs => inputs.filter(input => (input as HTMLInputElement).checked).map(input => (input.closest('label')?.innerText ?? '').split('\n')[0]!.trim()))
    expect(checked, 'her stored model is the checked one').toEqual(['Sonnet'])
    // (2) the Capricho = "Padrão do motor" + only the levels the engine accepts for THAT model, in words (never the id), her level selected.
    const sonnet = (claude.models ?? []).find(model => model.id === 'sonnet')
    expect(sonnet, 'the host lists Sonnet').toBeDefined()
    expect(await effortNames(page)).toEqual(['Padrão do motor', ...sonnet!.effortLevels.map(level => EFFORT_WORDS[level] ?? level)])
    expect(await page.locator('[data-engine-block="effort"] [role="radio"][aria-checked="true"]').allInnerTexts()).toEqual(['Caprichado'])
    // (3) where the list came from, in plain words (EFFORT-SPEC §4.1) — the fake CLI reports no menu, so the host answers with its table and says so.
    const blockText = await page.locator('[data-engine-block="model"]').innerText()
    if (claude.source === 'static') expect(blockText).toMatch(/Lista padrão do .+: sua conta não informou os modelos/u)
    else if (claude.source === 'cli') expect(blockText).toContain('Da sua conta')
    // (4) no technical id and no "recommended" seal anywhere on the screen.
    const screen = await page.locator('body').innerText()
    expect(screen, 'no raw level id on the screen').not.toMatch(/\b(xhigh|medium|low)\b/u)
    expect(screen).not.toMatch(/Recomendad/iu)
    // (5) layout (Muse 06:12, EFFORT-SPEC §4.1): the Capricho sits BELOW the model list and spans its width — not two columns.
    const modelBox = await page.locator('[data-engine-block="model"]').boundingBox()
    const effortBox = await page.locator('[data-engine-block="effort"]').boundingBox()
    expect(modelBox !== null && effortBox !== null).toBe(true)
    expect(effortBox!.y, `stacked: the Capricho (${JSON.stringify(effortBox)}) starts below the Modelo (${JSON.stringify(modelBox)})`).toBeGreaterThanOrEqual(modelBox!.y + modelBox!.height - 2)
    expect(effortBox!.width, 'the Capricho is as wide as the model list').toBeGreaterThanOrEqual(modelBox!.width - 2)
    await page.keyboard.press('Escape')
    await page.locator('[data-engine-block="model"]').waitFor({ state: 'detached', timeout: 10_000 })
  }, 120_000)

  /** What the person picked on the screen in the test below (the model is whatever the HOST's menu lists that is not Sonnet), so the next tests assert on the same words. */
  let picked: { readonly id: string; readonly label: string; readonly level: string } | undefined
  /** Back to the conversation (#geral, where the team strip and the typed lines live): the app lands there on a reload. */
  const backToConversation = async (): Promise<void> => {
    await v11.page.reload({ waitUntil: 'load' })
    await v11.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await v11.page.waitForTimeout(1_500)
  }

  it('[EFF-1 tela → host → CLI] the person picks another model + a higher Capricho on the screen: it is stored for HER only, the chip says it, and her NEXT turn asks the CLI for exactly that (`--model … --effort …`)', async () => {
    const { page } = v11
    const claude = await claudeMenu()
    // Whatever the host lists: a model that is not Sonnet (her current one) and a level of it other than the current "high".
    const target = (claude.models ?? []).find(model => model.id !== 'sonnet' && model.effortLevels.some(level => level !== 'high'))
    expect(target, `the host lists a model other than Sonnet with a level other than high (${JSON.stringify((claude.models ?? []).map(model => model.id))})`).toBeDefined()
    const level = target!.effortLevels.includes('xhigh') ? 'xhigh' : target!.effortLevels.find(item => item !== 'high')!
    picked = { id: target!.id, label: target!.label, level }
    const trigger = await openSettingsPersonas(creation.id)
    await trigger.click()
    await page.locator('[data-engine-block="model"]').waitFor({ state: 'visible', timeout: 20_000 })
    expect(await modelNames(page), 'what the modal offers is the host\'s menu, so the pick below exists').toContain(target!.label)
    await page.locator('[data-engine-block="model"] label', { hasText: target!.label }).first().click()
    // keyboard on the segmented control: the checked segment takes focus, the arrows move the choice (roving), like any radio group.
    const segments = await effortNames(page)
    const checkedBefore = (await page.locator('[data-engine-block="effort"] [role="radio"][aria-checked="true"]').allInnerTexts()).map(text => text.trim())
    await page.locator('[data-engine-block="effort"] [role="radio"][aria-checked="true"]').focus()
    await page.keyboard.press('ArrowRight')
    const afterArrow = (await page.locator('[data-engine-block="effort"] [role="radio"][aria-checked="true"]').allInnerTexts()).map(text => text.trim())
    expect(afterArrow, `ArrowRight moves to the next segment (${JSON.stringify(segments)}; was ${JSON.stringify(checkedBefore)})`).toEqual([segments[(segments.indexOf(checkedBefore[0]!) + 1) % segments.length]!])
    // ...then the choice itself, by its words.
    await page.locator('[data-engine-block="effort"]').getByRole('radio', { name: EFFORT_WORDS[level] ?? level, exact: true }).click()
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await page.locator('[data-engine-block="model"]').waitFor({ state: 'detached', timeout: 20_000 })
    // the chip in the row says it in words ...
    const row = page.locator(`[data-persona-settings="personas"] li[data-persona-id="${creation.id}"] [data-persona-engine-trigger]`)
    const sawChip = await until(page, async () => (await row.innerText()).includes(EFFORT_WORDS[level] ?? level), 20_000, 400)
    const chipText = await row.innerText()
    expect(sawChip, `the row says the new Capricho in words (it says "${chipText}")`).toBe(true)
    expect(chipText.toLowerCase(), 'and the model').toContain(target!.label.split(' ')[0]!.toLowerCase())
    // ... and the HOST holds exactly that for her and nothing for the others.
    type View = { id: string; engine?: { runnerModel?: string | null; runnerEffort?: string | null } }
    const team = await hostRpcOk<View[]>(page, 'listPersonas', scope())
    const mine = team.find(persona => persona.id === creation.id)
    expect({ model: mine?.engine?.runnerModel, effort: mine?.engine?.runnerEffort }).toEqual({ model: target!.id, effort: level })
    expect(team.filter(persona => persona.id !== creation.id).every(persona => (persona.engine?.runnerEffort ?? null) === null), 'nobody else was touched').toBe(true)
    // ... and her next turn really asks the CLI for it.
    const before = v11.session.fakeCli.invocations().length
    await postAsPerson(page, tenant, '@Criação escreva uma segunda frase curta para o cartaz')
    const turn = await until(page, async () => v11.session.fakeCli.invocations().slice(before).find(call => call.event === 'turn'), 60_000, 400)
    expect(turn, 'her turn ran').toBeDefined()
    const argvs = v11.session.fakeCli.invocations().slice(before).filter(call => call.event === 'invoke' && call.argv.includes('-p')).map(call => call.argv.join(' '))
    expect(argvs.some(argv => new RegExp(`--model\\s+${target!.id}\\b`, 'u').test(argv) && new RegExp(`--effort\\s+${level}\\b`, 'u').test(argv)), `argv of her session: ${argvs.join(' | ')}`).toBe(true)
  }, 180_000)

  it('[EFF-1 tela] the persona card shows the same chip as Configurações › Personas', async () => {
    const { page } = v11
    expect(picked, 'the previous test picked a model and a Capricho').toBeDefined()
    await backToConversation()
    const trigger = page.locator(`[data-persona-card-trigger="${creation.id}"]`).first()
    expect(await trigger.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false), 'the face of Criação with the ⋯ trigger is in the conversation (the team strip of #geral)').toBe(true)
    await trigger.click()
    const chip = page.locator('[data-persona-engine-chip]').first()
    await chip.waitFor({ state: 'visible', timeout: 15_000 })
    const text = await chip.innerText()
    expect(text, 'the card says the same words as the settings row').toContain(EFFORT_WORDS[picked!.level] ?? picked!.level)
    expect(text.toLowerCase()).toContain(picked!.label.split(' ')[0]!.toLowerCase())
  }, 120_000)

  it('HT-3: the PERSON moves a DELIVERED card (no folder) to Fazendo and the owner persona STARTS AGAIN — a NEW assignment, a 2nd stub turn whose prompt says the card was moved — with ONE typed line (started)', async () => {
    // Bolt 07/11, rule (2): a card whose assignment already gave its turn (delivered with no folder to apply, failed, asked, stopped) + Fazendo = "do it again". Before the patch the
    // line said "started" while nothing started (the delivery line of the old assignment was still there, so the runner skipped the card).
    const board = await hostRpcOk<{ workflow: { columns: Array<{ id: string; category: string }> } }>(v11.page, 'getProjectBoard', scope())
    const doing = board.workflow.columns.find(column => column.category === 'doing')
    expect(doing, 'the project has a "Fazendo" column').toBeDefined()
    const tasks = await hostRpcOk<Array<{ id: string; title: string; stage?: string }>>(v11.page, 'listTasks', scope())
    expect(tasks.length, 'there is a card to move (the first delivery)').toBeGreaterThan(0)
    const card = tasks.find(task => task.stage === 'review') ?? tasks.find(task => task.stage === 'done') ?? tasks[0]!
    const before = v11.turns()
    const invokesBefore = v11.session.fakeCli.invocations().length
    await hostRpcOk(v11.page, 'moveTicket', { ...scope(), ticketId: card.id, columnId: doing!.id })
    const line = await until(v11.page, async () => (await channelMessages(v11.page, tenant)).find(message => message.harness?.verb === 'board_card_move' && message.harness.ticketId === card.id), 45_000)
    expect(line, 'one typed line says what happened (started or held, with the reason)').toBeDefined()
    expect({ outcome: line!.harness!.outcome, reason: line!.harness!.reason ?? null }, `a delivered card without a folder starts again; the line: ${JSON.stringify(line!.harness)}`).toEqual({ outcome: 'started', reason: null })
    const ran = await until(v11.page, async () => v11.turns() > before, 60_000, 400)
    const seen = v11.session.fakeCli.invocations().slice(invokesBefore).map(call => `${call.event}:${call.tool}`)
    expect(ran, `the owner persona really worked (a 2nd stub turn ran). Line: ${JSON.stringify(line!.harness)}; card: ${JSON.stringify(card)}; stub events after the move: ${JSON.stringify(seen)}`).toBeDefined()
    const turns = v11.session.fakeCli.invocations().slice(invokesBefore).filter(call => call.event === 'turn')
    expect(turns.some(call => call.needles?.[MOVED_NEEDLE] === true), `the prompt of the new assignment says the card was moved to Fazendo (${JSON.stringify(turns.map(call => call.needles))})`).toBe(true)
    // The line is in the CONVERSATION (#geral): the earlier tests left the app on a Settings tab, so go back to where the person reads the thread.
    await backToConversation()
    await v11.page.getByText(/começou .* porque você moveu para Fazendo/u).first().waitFor({ state: 'visible', timeout: 30_000 })
  }, 240_000)
})

describe.skipIf(!run).sequential('V11 web — HT-3 "tente de novo": o 1º turno falha, a pessoa move o cartão para Fazendo, o 2º turno RODA (fake)', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let failDir: string
  let failFile: string

  beforeAll(async () => {
    failDir = mkdtempSync(join(tmpdir(), 'v11-ht3-fail-'))
    failFile = join(failDir, 'fail.txt')
    // The host's environment cannot change after it starts: the stub fails WHILE the switch file exists (absent now, so onboarding and the first delivery work).
    v11 = await openV11Session({ startOnBoard: true, engine: { turnMs: 1_500, failFile, needles: [MOVED_NEEDLE] } })
    tenant = await v11Tenant(v11.page)
  }, 420_000)

  afterAll(async () => {
    await v11?.close()
    rmSync(failDir, { recursive: true, force: true })
  }, 60_000)

  it('HT-3: the engine fails the first turn, the card is left, the person moves it to Fazendo, and the owner persona really RUNS a 2nd turn (the line "started" is true)', async () => {
    const { page } = v11
    const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
    // (1) the engine is "down" for this ask only.
    writeFileSync(failFile, 'motor de mentira falhou')
    const turnsBeforeAsk = v11.turns()
    await postAsPerson(page, tenant, '@Criação escreva uma frase curta de abertura para o cartaz')
    expect(await until(page, async () => v11.turns() > turnsBeforeAsk, 60_000, 400), 'the stub answered (a failing) turn').toBeDefined()
    // (2) wait until the host stops trying: no new stub turn for 8 s (it may retry once), then the card must exist on the board, not delivered.
    let lastTurns = v11.turns()
    let quietSince = Date.now()
    await until(page, async () => {
      const now = v11.turns()
      if (now !== lastTurns) { lastTurns = now; quietSince = Date.now() }
      return Date.now() - quietSince >= 8_000
    }, 90_000, 1_000)
    const tasks = await hostRpcOk<Array<{ id: string; title: string; stage?: string }>>(page, 'listTasks', scope)
    const card = tasks.find(task => /frase curta de abertura/iu.test(task.title))
    expect(card, `the failed ask left a card (${tasks.map(task => `${task.title} [${task.stage ?? '?'}]`).join(' | ')})`).toBeDefined()
    // (3) the engine works again; the person drags the card to Fazendo.
    rmSync(failFile)
    const board = await hostRpcOk<{ workflow: { columns: Array<{ id: string; category: string }> } }>(page, 'getProjectBoard', scope)
    const doing = board.workflow.columns.find(column => column.category === 'doing')
    expect(doing, 'the project has a "Fazendo" column').toBeDefined()
    const before = v11.turns()
    const invokesBefore = v11.session.fakeCli.invocations().length
    await hostRpcOk(page, 'moveTicket', { ...scope, ticketId: card!.id, columnId: doing!.id })
    const line = await until(page, async () => (await channelMessages(page, tenant)).find(message => message.harness?.verb === 'board_card_move' && message.harness.ticketId === card!.id), 45_000)
    expect(line, 'one typed line says what happened').toBeDefined()
    expect({ outcome: line!.harness!.outcome, reason: line!.harness!.reason ?? null }, `the line: ${JSON.stringify(line!.harness)}`).toEqual({ outcome: 'started', reason: null })
    // (4) "started" is true: a stub turn ran, its prompt says the card was moved, and the work reaches the thread after the move.
    expect(await until(page, async () => v11.turns() > before, 60_000, 400), `a 2nd turn ran after the move; stub events: ${JSON.stringify(v11.session.fakeCli.invocations().slice(invokesBefore).map(call => `${call.event}:${call.tool}`))}`).toBeDefined()
    const turns = v11.session.fakeCli.invocations().slice(invokesBefore).filter(call => call.event === 'turn')
    expect(turns.some(call => call.needles?.[MOVED_NEEDLE] === true), `the new assignment's prompt says the card was moved (${JSON.stringify(turns.map(call => call.needles))})`).toBe(true)
    await page.getByText(/começou .* porque você moveu para Fazendo/u).first().waitFor({ state: 'visible', timeout: 30_000 })
  }, 300_000)
})
