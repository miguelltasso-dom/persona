/**
 * P1-02 (Carbon, colheita-s1), item 12 in the ordinary road: a Task the owner asks for in #geral or a DM is chained straight into the work chain by `ingest` — only `driveTicket` ran Tasks through
 * `backgroundWork.run` — so a normal request NEVER went to the background past the threshold: the persona stayed busy in the channel until it ended; and once a Task IS in the background the persona
 * is free, yet every new message was still met with "Estou terminando …" as if she were busy. No real CLI: the runner is a fake whose Task turn we hold open.
 */
import { createFakeRunner, type Runner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import { backgroundWorkOf } from '../src/background-work.ts'
import type PersonaHost from '../src/index.ts'
import { emitRunnerStep, type HostRunnerRequest } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'bia', name: 'Bia', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calma.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
}

/** The Task's turn stays open until `release()`; every other call of the persona (talk, triage) is the plain fake. */
function longTask(h: PersonaHost): { release: () => void } {
  let open = (): void => {}
  const gate = new Promise<void>((resolve) => { open = resolve })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const inner = createFakeRunner()
    if (request?.purpose !== 'task') return Promise.resolve(inner)
    return Promise.resolve(new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'whenIdle') return async (session: string) => { await gate; return target.whenIdle(session) }
        return Reflect.get(target, prop, receiver) as unknown
      },
    }))
  }
  return { release: () => { open() } }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

it('a Task the owner asks for goes to the background past the threshold, the persona says so ONCE, and she is free in the channel while it runs', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 40, nowMs: () => Date.now() }) // the book is created ONCE per host: ours, with a short threshold
  const task = longTask(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  await sleep(300)
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')!
  expect(book.isBackground(ticket.id)).toBe(true) // RED today: `ingest` never runs the Task through the book
  expect(thread(h).filter(row => row.actorId === 'bia' && row.body === 'Sigo no fundo; te aviso quando terminar.')).toHaveLength(1)
  // the work chain is free: a plain question to the persona is answered while the Task still runs
  h.postMessage({ id: 'u2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia que horas a padaria abre amanhã?', actorId: 'ana', subjectId: 'u2' })
  await h.orchestration.flush('pp')
  expect(thread(h).some(row => row.actorId === 'bia' && row.id.startsWith('coord-u2-'))).toBe(true)
  task.release()
  await book.whenIdle()
})

it('a persona who already moved her Task to the background is free: a new message is not met with "Estou terminando…", but "como está indo?" is still answered with the status', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 40, nowMs: () => Date.now() })
  const task = longTask(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  await sleep(300)
  h.postMessage({ id: 'u2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia que horas a padaria abre amanhã?', actorId: 'ana', subjectId: 'u2' })
  await h.orchestration.flush('pp')
  expect(thread(h).filter(row => /terminando|respondo em seguida/u.test(row.body))).toEqual([]) // RED today: "Estou terminando “…”; respondo em seguida."
  h.postMessage({ id: 'u3', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia como está indo?', actorId: 'ana', subjectId: 'u3' })
  await h.orchestration.flush('pp')
  expect(thread(h).some(row => row.id === 'coord-u3-status')).toBe(true) // the zero-token status line still answers
  task.release()
  await book.whenIdle()
})

/** Like {@link longTask}, and the Task's runner is handed back so the spec can play its tool calls (`emitRunnerStep`, the same door the live tap uses). */
function longTaskWithRunner(h: PersonaHost): { release: () => void; runner: () => Runner | undefined } {
  const gate = Promise.withResolvers<undefined>()
  let taskRunner: Runner | undefined
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const inner = createFakeRunner()
    if (request?.purpose !== 'task') return Promise.resolve(inner)
    taskRunner = new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'whenIdle') return async (session: string) => { await gate.promise; return target.whenIdle(session) }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    return Promise.resolve(taskRunner)
  }
  return { release: () => { gate.resolve(undefined) }, runner: () => taskRunner }
}

/** The Task's runner exists once the chain started its turn. */
async function taskRunnerOf(task: { runner: () => Runner | undefined }): Promise<Runner> {
  for (let waited = 0; waited < 80 && task.runner() === undefined; waited += 1) await sleep(25)
  return task.runner()!
}

it('the 20th tool call of a Task turn moves it to the background long before the clock, and the persona says so once', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) }) // the clock is a minute away: only the tool count can detach it now
  const task = longTaskWithRunner(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  const runner = await taskRunnerOf(task)
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')!
  for (let call = 0; call < 19; call += 1) emitRunnerStep(runner, 'Read', new Date().toISOString())
  expect(book.isBackground(ticket.id)).toBe(false)
  emitRunnerStep(runner, 'Read', new Date().toISOString())
  expect(book.isBackground(ticket.id)).toBe(true) // RED today: the book is never told that a tool was called
  await sleep(50)
  expect(thread(h).filter(row => row.actorId === 'bia' && row.body === 'Sigo no fundo; te aviso quando terminar.')).toHaveLength(1)
  task.release()
  await book.whenIdle()
})

it('19 tool calls are not enough: a Task that ends before the 20th is never moved and says nothing', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 60_000, nowMs: () => Date.parse(h.orchestration.now()) })
  const task = longTaskWithRunner(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  const runner = await taskRunnerOf(task)
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')!
  for (let call = 0; call < 19; call += 1) emitRunnerStep(runner, 'Read', new Date().toISOString())
  task.release()
  await book.whenIdle()
  expect(book.isBackground(ticket.id)).toBe(false)
  expect(thread(h).filter(row => row.body === 'Sigo no fundo; te aviso quando terminar.')).toEqual([])
})

/** The runner of one Task of Bia, the way the host resolves it before a turn (driven directly: a second message to a persona whose Task is open is absorbed, never started in front). */
function resolveTask(h: PersonaHost, ticketId: string): Promise<unknown> {
  const call = (h.orchestration as unknown as { resolveFor(persona: unknown, projectId: string, mode: string, purpose: string, onFirstToken: undefined, answerOnly: boolean, ticketId: string): Promise<unknown> }).resolveFor
  return call.call(h.orchestration, h.product.getPersona('bia'), 'pp', 'asked', 'task', undefined, false, ticketId)
}

const keysOf = (h: PersonaHost, runner: unknown): string[] => [...h.orchestration.warmRunners.entries()].filter(([, held]) => held === runner).map(([key]) => key)

it('P1-02(b): while a Task of Bia runs in the background on the shared warm runner, a second Task of hers gets a runner of its own; with none in the background they share again', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 40, nowMs: () => Date.now() })
  const task = longTask(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  await sleep(300)
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')!
  expect(book.isBackground(ticket.id)).toBe(true)
  const sharedKeys = [...h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:bia:task'))
  expect(sharedKeys, 'the background Task holds the shared warm runner of Bia').toHaveLength(1)
  const second = await resolveTask(h, 'second')
  // RED today: the second Task is served by the SAME runner (one TextCapture, one usage context, one action bridge for two turns open at once)
  expect(keysOf(h, second)).toEqual(['pp:bia:task:second:solo'])
  expect(await resolveTask(h, 'second')).toBe(second) // the same Task asks again: its own runner, warm
  task.release()
  await book.whenIdle()
  // nobody is in the background now: a new Task is served by the warm runner Bia already has, not a runner of its own
  const fourth = await resolveTask(h, 'fourth')
  expect(keysOf(h, fourth).some(key => key.includes(':fourth:'))).toBe(false)
})
