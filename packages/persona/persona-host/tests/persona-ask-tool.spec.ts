import { createFakeRunner, createMcpGateway } from '@deepseek-ai/dsh-persona-runners'
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import { productToolsOpener } from '../src/harness-turn.ts'
import { ASK_TOOL, createAskTool, MAX_ASKS_PER_TASK, type AskToolDeps } from '../src/persona-ask-tool.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * D-079 (b), the host's half of `persona_ask` for a worker of a REAL CLI: she asks through the TOOL during her turn; the question opens on
 * the Task (card in the thread), the turn that ends is NOT a delivery, the Task waits, and the person's answer comes back to the SAME Task
 * and session. Limits: the Task must be hers, two questions per Task, the same call twice answers the same.
 */

const ticketOf = (id: string, owner: string): Ticket => ({
  id, title: `Tarefa ${id}`, decisionId: 'd', mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
  channels: [], assignments: [], inputs: [], undelivered: [], createdAt: '2026-11-04T12:00:00.000Z', updatedAt: '2026-11-04T12:00:00.000Z',
  origin: { triggerId: 'm0', triggerIds: ['m0'] }, execution: { name: owner, directory: '.', assignment: 'x' },
})

interface Fake { deps: AskToolDeps; asked: unknown[]; assumed: string[]; docs: Map<string, { count: number }> }

/** The tool on fake ports: what PersonaAsks answers is scripted, every call is recorded. */
function fake(opened: { ok: boolean; message?: string } = { ok: true }): Fake {
  const asked: unknown[] = []
  const assumed: string[] = []
  const docs = new Map<string, { count: number }>()
  const deps: AskToolDeps = {
    product: { getPersona: id => (id === 'nina' ? ({ id: 'nina', name: 'Nina', projectId: 'pp' } as never) : undefined) },
    screens: {
      get: (_project: string, _kind: string, id: string) => docs.get(id),
      put: (_project: string, _kind: string, id: string, doc: { count: number }) => { docs.set(id, doc) },
    } as never,
    ticketOf: (_project, ticketId) => (ticketId === 't1' ? ticketOf('t1', 'Nina') : ticketId === 't-other' ? ticketOf('t-other', 'Bento') : undefined),
    asks: {
      ask: (input) => { asked.push(input.questions); return opened.ok ? { ok: true, askId: 'a1' } : { ok: false, message: opened.message ?? 'não' } },
      assume: (input) => { assumed.push(input.assumption); return { ok: true, message: 'Registrei a suposição no fio. Siga com o trabalho.' } },
    },
  }
  return { deps, asked, assumed, docs }
}
const run = (ticketId = 't1', assignmentId = 'a1') => ({ personaId: 'nina', ticketId, assignmentId })

it('she asks: the question reaches PersonaAsks as written, and the model is told to END the turn (the answer comes in the next one)', () => {
  const { deps, asked } = fake()
  const tool = createAskTool(deps)
  const sentence = tool({ run: run(), question: 'Qual cor usamos?' })
  expect(asked).toEqual([{ question: 'Qual cor usamos?' }])
  expect(sentence).toContain('Pergunta enviada à pessoa')
  expect(sentence).toContain('Termine este turno agora')
  const structured = tool({ run: run('t1', 'a2'), question: 'Qual?', questions: [{ question: 'Qual cor?', options: ['Azul', 'Verde'] }] })
  expect(asked[1]).toEqual([{ question: 'Qual cor?', options: ['Azul', 'Verde'] }]) // the structured form goes through untouched
  expect(structured).toContain('Pergunta enviada')
})

it('the Task must be HERS: a foreign or unknown Task gets a sentence and asks nothing', () => {
  const { deps, asked } = fake()
  const tool = createAskTool(deps)
  expect(tool({ run: run('t-other'), question: 'Posso?' })).toBe('Essa tarefa não é sua; não dá para perguntar por ela.')
  expect(tool({ run: run('ghost'), question: 'Posso?' })).toBe('Essa tarefa não é sua; não dá para perguntar por ela.')
  expect(tool({ run: { personaId: 'ghost', ticketId: 't1', assignmentId: 'a1' }, question: 'Posso?' })).toBe('Essa tarefa não é sua; não dá para perguntar por ela.')
  expect(asked).toEqual([])
})

it('the same call twice answers the same and opens ONE question (a retry never asks twice, never counts twice)', () => {
  const { deps, asked, docs } = fake()
  const tool = createAskTool(deps)
  const first = tool({ run: run('t1', 'a1'), question: 'Qual cor usamos?' })
  const again = tool({ run: run('t1', 'a1'), question: '  qual  cor usamos?  ' })
  expect(again).toBe(first)
  expect(asked).toHaveLength(1)
  expect(docs.get('t1')?.count).toBe(1)
})

it(`at most ${String(MAX_ASKS_PER_TASK)} questions per Task: the next one is refused with the way forward (assumption), PersonaAsks is not even asked`, () => {
  const { deps, asked } = fake()
  const tool = createAskTool(deps)
  for (let index = 0; index < MAX_ASKS_PER_TASK; index += 1) expect(tool({ run: run('t1', `a${String(index)}`), question: `Pergunta ${String(index)}?` })).toContain('Pergunta enviada')
  const refused = tool({ run: run('t1', 'a9'), question: 'Mais uma?' })
  expect(refused).toContain('Você já perguntou')
  expect(refused).toContain('persona_ask({ assumption')
  expect(asked).toHaveLength(MAX_ASKS_PER_TASK)
})

it('a refusal of PersonaAsks (an open question, a repeat, the daily budget) reaches the model as its sentence and does not count', () => {
  const { deps, docs } = fake({ ok: false, message: 'Você já tem uma pergunta aberta nesta tarefa. Espere a resposta; ela volta para você.' })
  const tool = createAskTool(deps)
  expect(tool({ run: run(), question: 'Qual cor?' })).toBe('Você já tem uma pergunta aberta nesta tarefa. Espere a resposta; ela volta para você.')
  expect(docs.get('t1')).toBeUndefined()
})

it('“I will go on assuming …” is one honest line for the person, not a question; and an empty call is told what to write', () => {
  const { deps, asked, assumed } = fake()
  const tool = createAskTool(deps)
  expect(tool({ run: run(), question: '', assumption: 'Uso azul, como no cardápio.' })).toBe('Registrei a suposição no fio. Siga com o trabalho.')
  expect(assumed).toEqual(['Uso azul, como no cardápio.'])
  expect(asked).toEqual([])
  expect(tool({ run: run(), question: '' })).toContain('Escreva a pergunta')
})

// ---- in the real host: the CLI's turn calls the tool, the Task waits, the answer comes back to the same Task and session ----

it('end to end: she asks DURING her turn → the card is in the thread, the turn is NOT a delivery, the Task waits; the answer returns to the SAME Task and session', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Pesquisa' }])
  h.sessionMemberId = 'ana'
  const rt = h.orchestration.runtime('pp')
  const gateway = createMcpGateway({
    hooks: {
      report: () => undefined, recall: () => '',
      ask: createAskTool({ product: h.product, screens: h.screens.screens, asks: h.personaAsks, ticketOf: (projectId, id) => h.orchestration.runtime(projectId).repo.tickets.get(id) }),
    },
    onlyWired: true,
  })
  const open = productToolsOpener({ gateway, toolLevel: 'write', taskTextOf: id => rt.repo.tickets.get(id)?.execution?.assignment ?? '' })
  const prompts: string[] = []
  const sessions: string[] = []
  const toolSaid: string[] = []
  let first = true
  {
    const inner = createFakeRunner()
    const runner: Runner = {
      ensureSession: (...args) => inner.ensureSession(...args),
      deliver: async (session, request, text, mode) => {
        sessions.push(session)
        prompts.push(text)
        if (first) {
          first = false
          const set = open({ personaId: 'nina', ticketId: session.replace(/^worker-/u, ''), assignmentId: request, cwd: '.' })
          const ask = set?.tools.find(tool => tool.name === ASK_TOOL)
          if (ask === undefined) throw new Error('persona_ask was not offered')
          toolSaid.push((await ask.handler({ question: 'Qual cor usamos no relatório?', options: ['Azul', 'Verde'] })).content)
          await set?.close?.()
        }
        await inner.deliver(session, request, text, mode)
      },
      cancel: (...args) => inner.cancel(...args),
      status: id => inner.status(id),
      whenIdle: id => inner.whenIdle(id),
      onEvent: listener => inner.onEvent(listener),
      capabilities: () => inner.capabilities(),
    }
    h.orchestration.warmRunners.set('pp:nina:task', runner) // the host reuses her warm Task runner: this is the one that answers
  }
  say(h, 'u1', '@Nina Faça o relatório do dia')
  await h.orchestration.flush('pp')
  const task = rt.repo.tickets.list().find(item => item.execution?.name === 'Nina')!
  // Offered to a plain Task (no board/sprint/routine words): every worker with a write grant may ask the person.
  expect(toolSaid[0]).toContain('Pergunta enviada à pessoa')
  // The question is OPEN on the Task and its card is in the thread, written by her; the turn's last words are not a delivery.
  expect(rt.repo.tickets.get(task.id)?.attention?.question).toBe('Qual cor usamos no relatório?')
  const thread = h.events.listProject('pp')
  expect(thread.some(item => item.actorId === 'nina' && item.body.includes('Qual cor usamos no relatório?'))).toBe(true)
  expect(thread.some(item => item.id === `coord-${task.id}-done`)).toBe(false) // no “Pronto”, no delivery
  expect(sessions).toHaveLength(1)

  // The person answers: the SAME Task goes on, in the SAME session, and the answer is in what she reads.
  expect(h.answerAttention({ ...SCOPE, ticketId: task.id, text: 'Azul' })).toBe(true)
  await h.orchestration.flush('pp')
  expect(sessions).toEqual([`worker-${task.id}`, `worker-${task.id}`])
  expect(prompts[1]).toContain('Azul')
  const after = rt.repo.tickets.get(task.id)!
  expect(after.attention).toBeUndefined()
  expect(after.assignments).toHaveLength(2)
  expect(rt.repo.tickets.list().filter(item => item.execution?.name === 'Nina')).toHaveLength(1) // not a new Task
})
