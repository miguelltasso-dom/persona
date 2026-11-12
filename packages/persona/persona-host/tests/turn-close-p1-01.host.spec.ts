/**
 * Carbon P1-01 (colheita S1): the end-of-turn controller (item 3) failed in four real cases. Written RED first (each test is the audit's steps), then fixed.
 *  (1) a Task whose last turn ends on a question closed as `ready` (the verdict `perguntou` was ignored by the orchestration);
 *  (3) a question followed by the technical fold of item 4 (`<details>`), or ending in an emoji with a skin tone, was not seen as a question; and a confirmation of a
 *      datum the owner already gave ("O WhatsApp (11) 91234-5678 é o número real?") was carried to the owner;
 *  (5) when the budget ran out on "gave up without trying", the turn ended as `feito` instead of the Continuar card.
 * (2, a tool the gate refused counting as proof) is in its own file; (4, the conversation) is `talk-close.host.spec.ts`.
 */
import { createFakeRunner, createScriptedRunner, type RunEvent } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
import { closeTurn, terminaPerguntando } from '../src/turn-close.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => { delete process.env.PERSONA_REAL_CLI })

const { host } = bindHostFile()
const AT = '2026-11-04T12:00:00.000Z'
const say = (text: string): RunEvent => ({ type: 'delta', at: AT, text })
const ended: RunEvent = { type: 'ended', at: AT, report: { state: 'ready', summary: 'turn ended' } }
const turn = (...events: RunEvent[]) => ({ events: [...events, ended] })
let counter = 0

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

async function runTask(turns: ReadonlyArray<{ events: readonly RunEvent[] }>, options: { readonly refused?: ReadonlyArray<readonly string[]> } = {}) {
  const h = host()
  seed(h)
  const logFrom = h.orchestration.turnCloseLog.length // the host is shared by the tests of this file: read only what THIS run decided
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = true
  h.orchestration.handoffPending = undefined
  h.orchestration.continueCard = () => undefined
  // The gate's side of the seam: what it REFUSED in each turn (the real bridge asks the real gate; here the answer is scripted, turn by turn).
  const refused = [...(options.refused ?? [])]
  h.orchestration.actions = options.refused === undefined ? undefined : {
    gateFor: () => Promise.resolve(undefined), adopt: () => undefined, arm: () => undefined, release: () => undefined, closeAll: () => Promise.resolve(),
    settle: () => ({ waiting: false, cards: 0, refused: refused.shift() ?? [] }),
  }
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async request => request.purpose === 'talk'
      ? createScriptedRunner({ turns: [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }] })
      : createScriptedRunner({ turns }),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  counter += 1
  h.postMessage({
    id: `m-p101-${String(counter)}`, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: `s-p101-${String(counter)}`, occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const lines = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => event.body)
  const tasks = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  const task = tasks.at(-1)
  const ticket = task === undefined ? undefined : h.orchestration.runtime('pp').repo.tickets.get(task.id)
  const report = ticket?.assignments.at(-1)?.report
  const log = h.orchestration.turnCloseLog.slice(logFrom).map(entry => `${entry.kind}${'motivo' in entry ? `:${String(entry.motivo)}` : ''}`)
  return { lines, report, question: ticket?.attention?.question, log }
}

it('(1) a Task whose last turn ends on a question WAITS for the owner (perguntou = espera): never ready, and her own words are what the thread shows', async () => {
  const got = await runTask([turn(say('Montei o README com a descrição da padaria. Você prefere fundo azul ou verde para a capa?'))])
  expect(got.report?.state).toBe('waiting')
  expect(String(got.question ?? '')).toContain('fundo azul ou verde') // the open question the owner sees in Aprovações
  expect(got.lines.some(line => line.includes('Montei o README com a descrição da padaria.'))).toBe(true) // her words, not only "Precisa de você: …"
  expect(got.lines.some(line => line.includes('Você prefere fundo azul ou verde para a capa?'))).toBe(true)
})

it('(1b) a Task that does NOT end on a question still closes as ready (nothing else changed)', async () => {
  const got = await runTask([turn(say('Montei o README com a descrição da padaria e o horário de funcionamento.'))])
  expect(got.report?.state).toBe('ready')
})

const tool = (name: string): RunEvent => ({ type: 'report', at: AT, report: { state: 'progress', summary: `tool:${name}` } })

it('(2) a tool the gate REFUSED is no proof: "Salvei o arquivo" after a refused Write is held back like a claim with no tool at all', async () => {
  const got = await runTask(
    [turn(tool('Write'), say('Pronto! Salvei o arquivo do cartaz.')), turn(say('Não consegui salvar o arquivo: a pasta do rascunho não aceitou a escrita.'))],
    { refused: [['Write'], []] },
  )
  expect(got.log[0]).toBe('continuar:sem-prova')
  expect(got.lines.some(line => line.includes('Salvei o arquivo do cartaz'))).toBe(false) // the claim the gate contradicted never reached the thread
  expect(got.lines.some(line => line.includes('a pasta do rascunho não aceitou a escrita'))).toBe(true) // what she says next, true, does
})

it('(2b) the same words after a Write the gate let through are posted as written (a refused call is the only one that stops counting)', async () => {
  const got = await runTask([turn(tool('Write'), say('Pronto! Salvei o arquivo do cartaz.'))], { refused: [[]] })
  expect(got.log).toEqual(['feito'])
  expect(got.lines.some(line => line.includes('Salvei o arquivo do cartaz'))).toBe(true)
})

it('(3) a question followed by the technical fold of item 4 is still a question (the "?" is not hidden by the <details>)', () => {
  const words = 'Qual cor você prefere para o cartaz?\n\n<details><summary>Detalhes</summary>\nCaminho: C:\\Users\\ana\\cartaz.svg\n</details>'
  expect(terminaPerguntando(words)).toBe(true)
  expect(closeTurn({ words, tools: [], savedFiles: 0, hadTools: true }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
  // …and a fold that carries a "?" of its own does not turn a statement into a question.
  expect(terminaPerguntando('O cartaz ficou pronto.\n\n<details><summary>Detalhes</summary>\nPor que falhou? ENOENT\n</details>')).toBe(false)
})

it('(3) a question that ends in an emoji with a skin tone, or a ZWJ sequence, is still a question', () => {
  expect(terminaPerguntando('Posso mandar hoje? 👍🏽')).toBe(true)
  expect(terminaPerguntando('Posso mandar hoje? 👩🏽‍🍳')).toBe(true)
  expect(terminaPerguntando('Pode ser assim? 🙂')).toBe(true)
  expect(terminaPerguntando('Mandei hoje 👍🏽')).toBe(false)
})

it('(3) a confirmation of a datum the owner already gave is answered from what the host knows, not carried to the owner', () => {
  const known = { ownerTexts: ['Meu zap é (11) 91234-5678, pode usar no cartaz.'] }
  for (const words of ['O WhatsApp (11) 91234-5678 é o número real?', 'Esse telefone (11) 91234-5678 está certo?']) {
    expect(closeTurn({ words, tools: [], savedFiles: 0, hadTools: true, known }).verdict, words).toMatchObject({ kind: 'continuar', motivo: 'pergunta-ja-respondida' })
  }
  // A real doubt about a DIFFERENT number is a real question: it goes to the owner.
  expect(closeTurn({ words: 'O WhatsApp (21) 98888-0000 também é da padaria?', tools: [], savedFiles: 0, hadTools: true, known }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
})

it('(4b) in a conversation the host forwards and schedules for her, but NEVER deletes or moves a file: "já apaguei" with no tool is held back even there (Bolt, Probe e2e C)', () => {
  const talk = { tools: [], savedFiles: 0, hadTools: false, hostActs: true } as const
  for (const words of ['Pronto, já apaguei o arquivo!', 'Removi a pasta antiga.', 'Apaguei o rascunho', 'Já movi a planilha para outra pasta.']) {
    expect(closeTurn({ words, ...talk }).verdict, words).toMatchObject({ kind: 'continuar', motivo: 'sem-prova' })
  }
  // not a claim: negated, a comma in a text, what the host really does for her, a question
  for (const words of ['Não apaguei o arquivo.', 'Removi a vírgula do texto.', 'Já encaminhei o pedido ao Téo.', 'Posso apagar o arquivo antigo?']) {
    expect(closeTurn({ words, ...talk }).verdict.kind, words).not.toBe('continuar')
  }
  // a real tool in the turn backs it (an Edit alone does not prove a deletion but a shell does; the owner's own files are the tool's business)
  expect(closeTurn({ words: 'Apaguei o arquivo antigo.', ...talk, tools: ['Bash'] }).verdict.kind).toBe('feito')
})

it('(5) when she gives up without trying AGAIN after being sent back, the turn does not end as "feito": the Continuar card, with an honest sentence', () => {
  const verdict = closeTurn({ words: 'Não consegui abrir o arquivo do cardápio.', tools: [], savedFiles: 0, hadTools: true }, { pushes: ['desistiu-cedo'] }).verdict
  expect(verdict.kind).toBe('cartao-continuar')
  expect(verdict.kind === 'cartao-continuar' ? verdict.fala : '').not.toBe('')
})
