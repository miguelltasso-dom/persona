/**
 * Colheita item 3 (Atlas 11/11), the HOST half with no model: how a persona's Task turn ENDS is decided by rules (`turn-close.ts`) on her raw words, with the tools the
 * OAR tap really saw. The runner is a scripted OAR runner (the same shape the real CLI streams: deltas, `tool:` reports, `ended`), so the proof goes through `tapTurn`.
 *
 *  - a "Pronto, enviei" no tool backs never reaches the chat: it goes back to her ONCE as an internal note; if she does the work, the true words are what is posted;
 *  - if she says it again without doing it, her words are NOT posted: one honest sentence is, the Task waits and the card "Continuar" is offered;
 *  - a question she leaves ends the turn there (perguntou = espera): no extra turn; a secret asked in the chat is corrected, then waits with the Cofre sentence;
 *  - real work is left alone, and the whole thing is behind a switch (off = the old behavior).
 */
import { createFakeRunner, createScriptedRunner, type RunEvent } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { Orchestration } from '../src/orchestration.ts'
import { resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
import { SEGREDO_FALA, SEM_PROVA_FALA } from '../src/turn-close.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => { delete process.env.PERSONA_REAL_CLI })

const { host } = bindHostFile()
let realCard: Orchestration['continueCard']
const AT = '2026-11-04T12:00:00.000Z'
const say = (text: string): RunEvent => ({ type: 'delta', at: AT, text })
const tool = (name: string): RunEvent => ({ type: 'report', at: AT, report: { state: 'progress', summary: `tool:${name}` } })
const ended: RunEvent = { type: 'ended', at: AT, report: { state: 'ready', summary: 'turn ended' } }
const turn = (...events: RunEvent[]) => ({ events: [...events, ended] })
type Scripted = ReturnType<typeof createScriptedRunner>

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

/** The same runner, but every prompt it is handed is kept (the first is the Task, the next ones are the internal notes). */
function spied(inner: Scripted, prompts: string[]): Scripted {
  return {
    ...inner,
    start: (input) => { prompts.push(input.prompt); return inner.start(input) },
    startTurn: (input) => { prompts.push(input.prompt); return inner.startTurn(input) },
    resume: (input) => { prompts.push(input.prompt); return inner.resume(input) },
  }
}

interface Card { readonly motivo: string; readonly fala: string; readonly ticketId: string }

async function run(turns: ReadonlyArray<{ events: readonly RunEvent[] }>, options: { on?: boolean; colleague?: boolean; realCard?: boolean } = {}) {
  const h = host()
  seed(h)
  const logFrom = h.orchestration.turnCloseLog.length // the host is shared by the tests of this file: read only what THIS run decided
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = options.on !== false
  h.orchestration.handoffPending = options.colleague === true ? () => true : undefined // Forge's pure read: an ask_colleague of hers has not come back
  const prompts: string[] = []
  const cards: Card[] = []
  realCard ??= h.orchestration.continueCard // the host wires Flint's card once; the shared host keeps it between tests
  h.orchestration.continueCard = options.realCard === true ? realCard : (card) => { cards.push(card) }
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async request => request.purpose === 'talk'
      ? createScriptedRunner({ turns: [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }] })
      : spied(createScriptedRunner({ turns }), prompts),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  h.postMessage({
    id: 'm-close', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const lines = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.map(event => event.body)
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]
  const report = task === undefined ? undefined : h.orchestration.runtime('pp').repo.tickets.get(task.id)?.assignments.at(-1)?.report
  const asks = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.filter(event => event.personaAsk !== undefined)
  return { h, prompts, cards, lines, report, asks, log: h.orchestration.turnCloseLog.slice(logFrom).map(entry => `${entry.kind}${'motivo' in entry ? `:${String(entry.motivo)}` : ''}`) }
}

const said = (lines: readonly string[], text: string): boolean => lines.some(line => line.includes(text))

it('a "Pronto, enviei" that no tool backs never reaches the chat: she is sent back once, and what she does after is what is posted', async () => {
  const got = await run([
    turn(say('Pronto! Enviei o orçamento.')),
    turn(tool('mcp__gmail__send_email'), say('Enviei o orçamento para a Ana, no e-mail dela.')),
  ])
  expect(got.prompts).toHaveLength(2) // the Task + ONE internal note
  expect(got.prompts[1]).toMatch(/Atenção/u)
  expect(said(got.lines, 'Enviei o orçamento para a Ana')).toBe(true)
  expect(said(got.lines, 'Pronto! Enviei o orçamento.')).toBe(false) // the words no tool backed were never posted
  expect(said(got.lines, 'Atenção')).toBe(false) // and the note is internal: not in the thread
  expect(got.log).toEqual(['continuar:sem-prova', 'feito'])
})

it('if she says it again without doing it, her words are NOT posted: one honest sentence is, the Task waits and the card Continuar is offered', async () => {
  const got = await run([turn(say('Pronto! Enviei o orçamento.')), turn(say('Pronto! Enviei o orçamento.'))])
  expect(got.prompts).toHaveLength(2)
  expect(said(got.lines, 'Enviei o orçamento')).toBe(false)
  expect(said(got.lines, SEM_PROVA_FALA)).toBe(true)
  expect(got.report?.state).toBe('waiting')
  expect(got.cards).toHaveLength(1)
  expect(got.cards[0]).toMatchObject({ motivo: 'sem-prova', fala: SEM_PROVA_FALA })
  expect(got.log).toEqual(['continuar:sem-prova', 'cartao-continuar:sem-prova'])
})

it('perguntou = espera: a turn that ends on a question gets no extra turn, and her words go as written', async () => {
  const got = await run([turn(say('Aqui está a legenda: Bolo de cenoura fresquinho todo dia. Quer que eu ajuste o tom?'))])
  expect(got.prompts).toHaveLength(1)
  expect(said(got.lines, 'Quer que eu ajuste o tom?')).toBe(true)
  expect(got.log).toEqual(['esperar-dono:perguntou'])
  expect(got.cards).toEqual([])
})

it('a secret asked in the chat is corrected once; asked again, it never reaches the thread: the Task waits with the Cofre sentence', async () => {
  const got = await run([turn(say('Qual é a senha do Instagram da padaria?')), turn(say('Pode me passar a senha do Instagram?'))])
  expect(got.prompts).toHaveLength(2)
  expect(got.prompts[1]).toMatch(/Cofre/u)
  expect(said(got.lines, 'senha do Instagram')).toBe(false)
  expect(said(got.lines, SEGREDO_FALA)).toBe(true)
  expect(got.report?.state).toBe('waiting')
  expect(got.log).toEqual(['continuar:pediu-segredo', 'esperar-dono:segredo'])
})

it('"não consegui" without a single tool is sent back to try first; after trying, the honest limit goes through', async () => {
  const got = await run([
    turn(say('Não consegui abrir o arquivo do cardápio.')),
    turn(tool('Read'), say('Não consegui abrir o cardápio: o PDF está corrompido.')),
  ])
  expect(got.prompts).toHaveLength(2)
  expect(said(got.lines, 'o PDF está corrompido')).toBe(true)
  expect(said(got.lines, 'Não consegui abrir o arquivo do cardápio.')).toBe(false)
  expect(got.log).toEqual(['continuar:desistiu-cedo', 'feito'])
})

it('real work is left alone: a tool ran and she says so, one turn, her words as written', async () => {
  const got = await run([turn(tool('Write'), say('Pronto! Salvei o cartaz em cartaz.svg.'))])
  expect(got.prompts).toHaveLength(1)
  expect(said(got.lines, 'Salvei o cartaz em cartaz.svg.')).toBe(true)
  expect(got.log).toEqual(['feito'])
})

it('it is a switch: off, the old behavior (her words are posted as they came, one turn, nothing decided)', async () => {
  const got = await run([turn(say('Pronto! Enviei o orçamento.'))], { on: false })
  expect(got.prompts).toHaveLength(1)
  expect(said(got.lines, 'Pronto! Enviei o orçamento.')).toBe(true)
  expect(got.log).toEqual([])
})

it('a hand-off she asked for that has not come back is a wait: no extra turn, never sent back for a "Pronto" (esperar-dono: colega)', async () => {
  const got = await run([turn(say('Pronto! Pedi a arte para a Bia.'))], { colleague: true })
  expect(got.prompts).toHaveLength(1)
  expect(got.log).toEqual(['esperar-dono:colega'])
  expect(got.cards).toEqual([])
})

it('with the REAL card (item 7) wired: the honest sentence is ONE line and the card only asks Continuar/Parar; her words never appear', async () => {
  const got = await run([turn(say('Pronto! Enviei o orçamento.')), turn(say('Pronto! Enviei o orçamento.'))], { realCard: true })
  expect(got.asks).toHaveLength(1)
  expect(JSON.stringify(got.asks[0]?.personaAsk)).toContain('Continuar')
  expect(JSON.stringify(got.asks[0]?.personaAsk)).toContain('Parar')
  expect(got.lines.filter(line => line === SEM_PROVA_FALA)).toHaveLength(1) // the sentence is a line, said once (the card does not repeat it)
  expect(said(got.lines, 'Enviei o orçamento')).toBe(false)
  expect(got.report?.state).toBe('waiting')
  expect(got.log).toEqual(['continuar:sem-prova', 'cartao-continuar:sem-prova'])
})
