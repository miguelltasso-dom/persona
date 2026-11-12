/**
 * Carbon P0-07b (runner half): every `answerOnce` of a persona (/lado, opinion, fan-out, the indicator refresh) shares the runner `pp:<persona>:talk:answer-only`, and the runner kept ONE
 * mutable `TextCapture`: the `started` of the second turn wiped the text of the first and its pieces fell on top of each other ("B1A2"). The state of a turn is now kept per session
 * (the handle's ticket id), and a reader that names its session reads ITS turn — never another's. A reader without a session still sees the turn that started last (what a
 * runner with one session always saw). Two turns interleave on the same runner, with the real tap and the real session facade; the "model" is a pump the spec drives.
 */
import { createFakeRunner, type RunEvent, type RunHandle, type StartTurnInput, type TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { lastRunnerText, lastRunnerTools, resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
import { openJourney, seedJourney } from './journeys/journey-host.ts'

const AT = '2026-11-12T10:00:00.000Z'

/** The turn runner the host wraps: each ticket id has its own queue of events that the spec pushes, in the order it wants them to interleave. */
function pump() {
  const queues = new Map<string, { events: RunEvent[]; wake: (() => void) | undefined }>()
  const started = new Set<string>()
  const queue = (id: string) => {
    let known = queues.get(id)
    if (known === undefined) { known = { events: [], wake: undefined }; queues.set(id, known) }
    return known
  }
  const handleOf = (id: string): RunHandle => ({ runId: `run-${id}`, sessionId: `native-${id}`, ticketId: id, assignmentId: `a-${id}`, personaId: 'nina', cwd: '.', model: 'haiku' })
  async function* play(handle: RunHandle): AsyncGenerator<RunEvent> {
    const mine = queue(handle.ticketId)
    for (;;) {
      while (mine.events.length === 0) await new Promise<void>((resolve) => { mine.wake = resolve })
      const event = mine.events.shift()
      if (event === undefined) continue
      yield event
      if (event.type === 'ended') return
    }
  }
  const turn = {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: '' }),
    authenticate: () => Promise.resolve({ ok: true, detail: '' }),
    start: (input: StartTurnInput) => { started.add(input.ticketId); return Promise.resolve(handleOf(input.ticketId)) },
    startTurn: (input: StartTurnInput) => { started.add(input.ticketId); return Promise.resolve(handleOf(input.ticketId)) },
    resume: (input: StartTurnInput) => Promise.resolve(handleOf(input.ticketId)),
    stream: play,
    events: play,
    cancel: () => Promise.resolve(),
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  } as unknown as TurnRunner
  const say = async (id: string, event: RunEvent): Promise<void> => {
    const mine = queue(id)
    mine.events.push(event)
    mine.wake?.()
    await new Promise<void>(resolve => setImmediate(resolve)) // the consumer of that queue handles it before the next push: the order is the spec's
  }
  /** Wait until the host has opened a turn for each of these sessions. */
  const opened = async (...ids: string[]): Promise<void> => {
    for (let round = 0; round < 400 && !ids.every(id => started.has(id)); round += 1) await new Promise<void>(resolve => setTimeout(resolve, 5))
    expect(ids.every(id => started.has(id))).toBe(true)
  }
  return { turn, handleOf, say, opened }
}

const text = (piece: string): RunEvent => ({ type: 'delta', at: AT, text: piece })
const tool = (name: string): RunEvent => ({ type: 'report', at: AT, report: { state: 'progress', summary: `tool:${name}` } })
const ended: RunEvent = { type: 'ended', at: AT, report: { state: 'ready', summary: 'turn ended' } }

beforeEach(() => { process.env.PERSONA_REAL_CLI = '1' })
afterEach(() => { delete process.env.PERSONA_REAL_CLI })

async function twoTurnsOnOneRunner() {
  const model = pump()
  const runners: PersonaRunnersSlice = { createFakeRunner, resolveRunner: () => Promise.resolve(model.turn) }
  const runner = await resolveHostRunner({ spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'allow-once', autonomy: 'on_request', personId: 'nina', purpose: 'talk' }, runners)
  await runner.ensureSession('aside-1', '.', 'lado', 'worker')
  await runner.ensureSession('ind-1', '.', 'indicador', 'worker')
  return { model, runner }
}

it('two turns of the same runner interleave: each session reads ITS own text, and a reader without a session reads the turn that started last', async () => {
  const { model, runner } = await twoTurnsOnOneRunner()
  const aside = runner.deliver('aside-1', 'r1', 'e o horário?', 'queue')
  const indicator = runner.deliver('ind-1', 'r2', 'atualize o número', 'queue')
  await new Promise<void>(resolve => setImmediate(resolve)) // both turns are opened (their handles exist)
  await model.say('aside-1', { type: 'started', at: AT, handle: model.handleOf('aside-1') })
  await model.say('aside-1', text('A1'))
  await model.say('ind-1', { type: 'started', at: AT, handle: model.handleOf('ind-1') }) // the second turn starts while the first is still talking
  await model.say('ind-1', text('B1'))
  await model.say('aside-1', text('A2'))
  await model.say('aside-1', ended)
  await model.say('ind-1', ended)
  await Promise.all([aside, indicator])
  // the failure was: 'ind-1' wiped 'A1' and 'A2' landed on top of 'B1'
  expect(lastRunnerText(runner, 'aside-1')).toBe('A1A2')
  expect(lastRunnerText(runner, 'ind-1')).toBe('B1')
  expect(lastRunnerText(runner)).toBe('B1') // no session named: the turn that started last, as a runner with a single session always showed
})

it('the tools a turn called are its own too (a session never inherits the tools of the turn next to it)', async () => {
  const { model, runner } = await twoTurnsOnOneRunner()
  const aside = runner.deliver('aside-1', 'r1', 'procure o arquivo', 'queue')
  const indicator = runner.deliver('ind-1', 'r2', 'some os pedidos', 'queue')
  await new Promise<void>(resolve => setImmediate(resolve))
  await model.say('aside-1', { type: 'started', at: AT, handle: model.handleOf('aside-1') })
  await model.say('ind-1', { type: 'started', at: AT, handle: model.handleOf('ind-1') })
  await model.say('aside-1', tool('Read'))
  await model.say('ind-1', tool('Bash'))
  await model.say('aside-1', tool('Grep'))
  await model.say('aside-1', ended)
  await model.say('ind-1', ended)
  await Promise.all([aside, indicator])
  expect(lastRunnerTools(runner, 'aside-1')).toEqual(['Read', 'Grep'])
  expect(lastRunnerTools(runner, 'ind-1')).toEqual(['Bash'])
})

it('a session the runner never ran reads nothing (never the text of another session); the prefix of a task session is ignored', async () => {
  const { model, runner } = await twoTurnsOnOneRunner()
  const aside = runner.deliver('aside-1', 'r1', 'oi', 'queue')
  await new Promise<void>(resolve => setImmediate(resolve))
  await model.say('aside-1', { type: 'started', at: AT, handle: model.handleOf('aside-1') })
  await model.say('aside-1', text('só da sessão'))
  await model.say('aside-1', ended)
  await aside
  expect(lastRunnerText(runner, 'nunca-rodou')).toBe('')
  expect(lastRunnerText(runner, 'worker-aside-1')).toBe('só da sessão') // a task session is named `worker-<ticket>`; its handle carries the ticket
})

it('answerOnce: two concurrent calls of the same persona on the shared answer-only runner each return THEIR OWN words (the /lado and the indicator refresh no longer mix)', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'haiku' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.orchestration.scripted = false
  const model = pump()
  const runners: PersonaRunnersSlice = { createFakeRunner, resolveRunner: () => Promise.resolve(model.turn) }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  const nina = { ...h.product.getPersona('nina')!, projectId: 'pp' }
  const aside = h.orchestration.answerOnce('pp', nina, 'aside-1', 'e o horário?', '')
  await model.opened('aside-1') // the first call has built and CACHED the answer-only runner: the second one gets that same runner (the shared key of the Carbon finding)
  const indicator = h.orchestration.answerOnce('pp', nina, 'ind-1', 'atualize o número', '')
  await model.opened('ind-1')
  await model.say('aside-1', { type: 'started', at: AT, handle: model.handleOf('aside-1') })
  await model.say('aside-1', text('Abrimos às '))
  await model.say('ind-1', { type: 'started', at: AT, handle: model.handleOf('ind-1') })
  await model.say('ind-1', text('indicador 12'))
  await model.say('aside-1', text('8h.'))
  await model.say('aside-1', ended)
  await model.say('ind-1', ended)
  expect(await aside).toBe('Abrimos às 8h.') // before: the indicator's started wiped it and its JSON fell into the answer
  expect(await indicator).toBe('indicador 12')
})
