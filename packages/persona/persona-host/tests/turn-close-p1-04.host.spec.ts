/**
 * Carbon P1-04 (round 2, residues of P1-01/P0-06): the conversation's end-of-turn rules are right, but the bubble that streams BEFORE they judge, and two switches, leaked.
 *   A. her first turn is streamed live into the reply bubble; when the rules send her back (turn 1 rejected) the bubble still shows the rejected words, and a Parar during the
 *      correction turn used to save THOSE words for good (`finishStopped(…, stream.text)`).
 *   B. `hostActs: true` let a false "Pronto, já enviei o e-mail" through in a conversation: the host sends nothing for a talk reply.
 *   D. `pendingInStream` (is she waiting on the person?) did not see a question that is followed by a closed `<details>`: the owner's "ok" became a mute sticker.
 * Written RED first (each test is the audit's steps), then fixed. The model is a scripted runner whose deltas stream into the bubble like a real CLI's.
 */
import { createFakeRunner, createScriptedRunner, registerRefusalSource, type RunEvent } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
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

/** What the thread shows of her reply right now (the bubble while it streams, the settled message after). */
const bubble = (h: PersonaHost, id: string): { body: string; type: string } | undefined => {
  const event = h.events.get(`coord-${id}-reply`)
  return event === undefined ? undefined : { body: event.body, type: event.type }
}

interface Options {
  /** Called when a turn AFTER the first one is handed to the runner (the internal note): the bubble is read here, and Parar can be pressed here. */
  readonly onCorrection?: (h: PersonaHost, id: string, prompt: string) => void
  readonly body?: string
}

async function run(turns: ReadonlyArray<{ events: readonly RunEvent[] }>, options: Options = {}) {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = true
  h.orchestration.handoffPending = undefined
  counter += 1
  const id = `m-p104-${String(counter)}`
  let prompts = 0
  const spied = (inner: Scripted): Scripted => {
    const seen = (prompt: string): void => {
      prompts += 1
      if (prompts > 1) options.onCorrection?.(h, id, prompt)
    }
    return {
      ...inner,
      start: (input) => { seen(input.prompt); return inner.start(input) },
      startTurn: (input) => { seen(input.prompt); return inner.startTurn(input) },
      resume: (input) => { seen(input.prompt); return inner.resume(input) },
    }
  }
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async request => request.purpose === 'talk'
      ? spied(createScriptedRunner({ turns }))
      : createScriptedRunner({ turns: [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'ok' } }] }] }),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  h.postMessage({
    id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: options.body ?? 'Como está o cartaz da promoção?', actorId: 'ana', subjectId: `s-${id}`, occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const everything = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => event.body)
  return { h, id, prompts, reply: bubble(h, id), everything }
}

const CLAIM = 'Salvei o arquivo com os preços novos.'
const HONEST = 'Aqui estão os preços novos, no texto: pão francês R$ 0,90, pão de queijo R$ 4,50, bolo de cenoura R$ 7,00.'

it('A1: when her first turn is rejected the bubble is reverted AT ONCE: while she corrects herself the thread no longer shows what was held back', async () => {
  let shown: string | undefined
  const got = await run([turn(say(CLAIM)), turn(say(HONEST))], { onCorrection: (h, id) => { shown = bubble(h, id)?.body } })
  expect(got.prompts).toBe(2) // the premise: she was sent back once
  expect(shown, 'the bubble must exist while she corrects herself').toBeDefined()
  expect(shown ?? '').not.toContain('Salvei o arquivo')
  expect(got.reply?.body).toContain('Aqui estão os preços novos') // and what she says next is what settles
})

it('A2: Parar during the correction turn keeps NOTHING of the rejected words: the bubble ends "Resposta cancelada.", never "Salvei o arquivo…" saved as her stopped answer', async () => {
  const got = await run([turn(say(CLAIM)), turn(say(HONEST))], { onCorrection: (h, id) => { h.orchestration.cancelled.add(id) } })
  expect(got.reply, 'the reply line must exist').toBeDefined()
  expect(got.reply?.type).not.toBe('partial')
  expect(got.reply?.body ?? '').not.toContain('Salvei o arquivo')
  expect(got.everything.some(body => body.includes('Salvei o arquivo'))).toBe(false)
  expect(got.reply?.body).toBe('Resposta cancelada.')
})

it('B: in a conversation "Pronto, já enviei o e-mail" is NOT proof of anything (the host sends nothing for a talk reply): she is sent back once, and what she says next is posted', async () => {
  const got = await run([
    turn(say('Pronto, já enviei o e-mail para o cliente com o orçamento.')),
    turn(say('Ainda não enviei nada. Aqui está o texto do e-mail para você revisar: Olá, segue o orçamento do evento de sábado.')),
  ])
  expect(got.prompts).toBe(2)
  expect(got.reply?.body ?? '').not.toContain('já enviei o e-mail')
  expect(got.reply?.body ?? '').toContain('Ainda não enviei nada')
  expect(got.everything.some(body => body.includes('Pronto, já enviei'))).toBe(false)
})

it('D: a question followed by a closed <details> still counts as "she is waiting on the person" (the owner\'s "ok" is an answer, not a mute sticker)', () => {
  const h = host()
  seed(h)
  const open = (id: string, body: string): void => {
    h.events.append({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body, actorId: 'coord', subjectId: `s-${id}`, occurredAt: AT })
  }
  open('q1', 'Tenho duas ideias de legenda. Prefere a mais curta ou a mais animada?\n\n<details><summary>Como cheguei nisso</summary>\n\nVi o histórico do perfil.\n</details>')
  expect(h.orchestration.pendingFromPersonaIn('pp', 'channel:geral')).toBe(true)
  open('q2', 'Ficou combinado assim.\n\n<details><summary>Como cheguei nisso</summary>\n\nUma dúvida minha: serve?\n</details>')
  expect(h.orchestration.pendingFromPersonaIn('pp', 'channel:geral')).toBe(false) // a "?" INSIDE the fold is no question
})

// ---- C. a Task with NO connector: the gate the runner opened itself refuses a write, and nobody read it ------------------------------------------------------------------------

const tool = (name: string): RunEvent => ({ type: 'report', at: AT, report: { state: 'progress', summary: `tool:${name}` } })

/** One Task (the owner asks for a file) whose runner has a gate of ITS OWN: `refusals` is what that gate refused, turn by turn. No host gate (`actions` undefined). */
async function runTaskWithOwnGate(turns: ReadonlyArray<{ events: readonly RunEvent[] }>, refusals: ReadonlyArray<readonly string[]>) {
  const h = host()
  seed(h)
  const logFrom = h.orchestration.turnCloseLog.length
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.turnClose = true
  h.orchestration.handoffPending = undefined
  h.orchestration.continueCard = () => undefined
  h.orchestration.actions = undefined // a Task without connectors has no host gate: that is the case
  const queue = [...refusals]
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async (request) => {
      if (request.purpose === 'talk') return createScriptedRunner({ turns: [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }] })
      const runner = createScriptedRunner({ turns })
      registerRefusalSource(runner, { takeRefusals: () => (queue.shift() ?? []).map(name => ({ tool: name })) })
      return runner
    },
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  counter += 1
  const id = `m-p104c-${String(counter)}`
  h.postMessage({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', body: 'preciso de um README no projeto', actorId: 'ana', subjectId: `s-${id}`, occurredAt: '2026-11-03T15:00:00.000Z' })
  await h.orchestration.flush('pp')
  const lines = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => event.body)
  const log = h.orchestration.turnCloseLog.slice(logFrom).map(entry => `${entry.kind}${'motivo' in entry ? `:${String(entry.motivo)}` : ''}`)
  return { lines, log }
}

it('C: a Write that the runner\'s OWN gate refused is no proof either: "Salvei o arquivo" is held back like a claim with no tool at all', async () => {
  const got = await runTaskWithOwnGate(
    [turn(tool('Write'), say('Pronto! Salvei o arquivo do cartaz.')), turn(say('Não consegui salvar o arquivo: a pasta do rascunho não aceitou a escrita.'))],
    [['Write'], []],
  )
  expect(got.log[0]).toBe('continuar:sem-prova')
  expect(got.lines.some(line => line.includes('Salvei o arquivo do cartaz'))).toBe(false)
  expect(got.lines.some(line => line.includes('a pasta do rascunho não aceitou a escrita'))).toBe(true)
})

it('C2: the same words after a Write the own gate let through (nothing refused) are posted as written', async () => {
  const got = await runTaskWithOwnGate([turn(tool('Write'), say('Pronto! Salvei o arquivo do cartaz.'))], [[]])
  expect(got.log).toEqual(['feito'])
  expect(got.lines.some(line => line.includes('Salvei o arquivo do cartaz'))).toBe(true)
})
