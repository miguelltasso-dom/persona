/**
 * Colheita item 3, in the CONVERSATION (#geral, a DM): how a talk turn ends is decided by rules (`turn-close.ts`) on her raw words, before the speech layer and before
 * anything is settled in the thread. The model is a scripted runner (deltas + `ended`), the same shape a real CLI streams.
 *
 *  - she says she SAVED a file in a conversation (no tool, no draft): the words are not posted, she is sent back once with an internal note, and what she says next is posted;
 *  - she says it again: ONE honest sentence is posted instead, and there is no "Continuar" card (a conversation has no Task to continue);
 *  - she ends on a question: no extra turn, her words as written (perguntou = espera);
 *  - a secret asked in the chat is corrected once, and never reaches the thread when asked again (the Cofre sentence goes);
 *  - the host acts for her in a conversation ("já encaminhei"): not called a lie;
 *  - an honest answer is left alone, and the whole thing is behind the same switch as the Task's.
 */
import { createFakeRunner, createScriptedRunner, type RunEvent } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
import { SEGREDO_FALA, SEM_PROVA_FALA } from '../src/turn-close.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => { delete process.env.PERSONA_REAL_CLI })

const { host } = bindHostFile()
const AT = '2026-11-04T12:00:00.000Z'
const say = (text: string): RunEvent => ({ type: 'delta', at: AT, text })
const ended: RunEvent = { type: 'ended', at: AT, report: { state: 'ready', summary: 'turn ended' } }
const turn = (...events: RunEvent[]) => ({ events: [...events, ended] })
type Scripted = ReturnType<typeof createScriptedRunner>
let counter = 0

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

/** The same runner, but every prompt it is handed is kept (the first is the conversation, the next ones are the internal notes). */
function spied(inner: Scripted, prompts: string[]): Scripted {
  return {
    ...inner,
    start: (input) => { prompts.push(input.prompt); return inner.start(input) },
    startTurn: (input) => { prompts.push(input.prompt); return inner.startTurn(input) },
    resume: (input) => { prompts.push(input.prompt); return inner.resume(input) },
  }
}

interface Card { readonly motivo: string; readonly fala: string }

async function run(turns: ReadonlyArray<{ events: readonly RunEvent[] }>, options: { on?: boolean; body?: string } = {}) {
  const h = host()
  seed(h)
  const logFrom = h.orchestration.turnCloseLog.length
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = options.on !== false
  h.orchestration.handoffPending = undefined
  const prompts: string[] = []
  const cards: Card[] = []
  h.orchestration.continueCard = (card) => { cards.push(card) }
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async request => request.purpose === 'talk'
      ? spied(createScriptedRunner({ turns }), prompts)
      : createScriptedRunner({ turns: [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'ok' } }] }] }),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  counter += 1
  const id = `m-talk-${String(counter)}`
  h.postMessage({
    id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: options.body ?? 'Como está o cartaz da promoção?', actorId: 'ana', subjectId: `s-${id}`, occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const events = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  const reply = events.find(event => event.id === `coord-${id}-reply`)?.body
  const log = h.orchestration.turnCloseLog.slice(logFrom).filter(entry => entry.ticketId === id).map(entry => `${entry.kind}${'motivo' in entry ? `:${String(entry.motivo)}` : ''}`)
  return { reply, prompts, cards, log, everything: events.map(event => event.body) }
}

it('an honest answer in a conversation is left alone: one turn, her words as written', async () => {
  const got = await run([turn(say('O cartaz da promoção ficou com o fundo claro e o preço grande. Posso mandar a versão final amanhã cedo.'))])
  expect(got.prompts).toHaveLength(1)
  expect(got.reply).toBe('O cartaz da promoção ficou com o fundo claro e o preço grande. Posso mandar a versão final amanhã cedo.')
  expect(got.log).toEqual(['feito'])
})

it('perguntou = espera: a talk turn that ends on a question gets no extra turn, and her words go as written', async () => {
  const got = await run([turn(say('Tenho duas ideias de legenda. Prefere a mais curta ou a mais animada?'))])
  expect(got.prompts).toHaveLength(1)
  expect(got.reply).toContain('Prefere a mais curta ou a mais animada?')
  expect(got.log).toEqual(['esperar-dono:perguntou'])
  expect(got.cards).toEqual([])
})

it('"Salvei o arquivo" in a conversation (no tool, no draft) is never posted: she is sent back once, and what she says next is what the thread shows', async () => {
  const got = await run([
    turn(say('Salvei o arquivo com os preços novos.')),
    turn(say('Aqui estão os preços novos, no texto: pão francês R$ 0,90, pão de queijo R$ 4,50, bolo de cenoura R$ 7,00.')),
  ])
  expect(got.prompts).toHaveLength(2) // the conversation + ONE internal note
  expect(got.prompts[1]).toMatch(/Atenção/u)
  expect(got.prompts[1]).toMatch(/não tem ferramentas|nesta rodada você não tem/u) // a conversation has none: the note asks for the content in the text
  expect(got.reply).toContain('Aqui estão os preços novos')
  expect(got.reply).not.toContain('Salvei o arquivo')
  expect(got.everything.some(body => body.includes('Atenção'))).toBe(false) // the note is internal
  expect(got.log).toEqual(['continuar:sem-prova', 'feito'])
})

it('if she says it again, her words are NOT posted: ONE honest sentence is, and there is no Continuar card (a conversation has no Task to continue)', async () => {
  const got = await run([turn(say('Salvei o arquivo com os preços novos.')), turn(say('Salvei o arquivo com os preços novos.'))])
  expect(got.prompts).toHaveLength(2)
  expect(got.reply).toBe(SEM_PROVA_FALA)
  expect(got.everything.some(body => body.includes('Salvei o arquivo'))).toBe(false)
  expect(got.cards).toEqual([])
  expect(got.log).toEqual(['continuar:sem-prova', 'cartao-continuar:sem-prova'])
})

it('a talk reply has no tools and the host sends/forwards nothing for it (Carbon P1-04): "já encaminhei" is a claim nothing backs, so she is sent back once and what she says next is posted', async () => {
  const got = await run([
    turn(say('Já encaminhei o pedido do cartaz para o Téo, ele volta com a arte ainda hoje.')),
    turn(say('Ainda não encaminhei nada. O pedido do cartaz está aqui para você revisar: fundo claro, preço grande e o prazo de sexta.')),
  ])
  expect(got.prompts).toHaveLength(2)
  expect(got.reply).not.toContain('Já encaminhei o pedido do cartaz')
  expect(got.reply).toContain('Ainda não encaminhei nada')
  expect(got.log[0]).toMatch(/^continuar:/u)
})

it('a secret asked in the chat is corrected once; asked again it never reaches the thread: the Cofre sentence goes instead', async () => {
  const got = await run([turn(say('Qual é a senha do Instagram da padaria?')), turn(say('Pode me passar a senha do Instagram?'))])
  expect(got.prompts).toHaveLength(2)
  expect(got.prompts[1]).toMatch(/Cofre/u)
  expect(got.reply).toBe(SEGREDO_FALA)
  expect(got.everything.some(body => body.includes('senha do Instagram'))).toBe(false)
  expect(got.log).toEqual(['continuar:pediu-segredo', 'esperar-dono:segredo'])
})

it('it is the same switch as the Task\'s: off, the old behavior (her words are posted as they came, one turn, nothing decided)', async () => {
  const got = await run([turn(say('Salvei o arquivo com os preços novos.'))], { on: false })
  expect(got.prompts).toHaveLength(1)
  expect(got.reply).toBe('Salvei o arquivo com os preços novos.')
  expect(got.log).toEqual([])
})
