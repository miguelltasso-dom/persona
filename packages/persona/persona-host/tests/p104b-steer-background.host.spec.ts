import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { expect, vi } from 'vitest'
import { backgroundWorkOf } from '../src/background-work.ts'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P1-04 (3rd point, colheita-s1-fix): "Direcionar agora" on a Task that is in the BACKGROUND. The host steers the persona's running Task (`runningTicketOf`, background included) AND posts the
 * person's message `steer:<persona>:<at>` in the thread; that message went through `ingest` → `absorbingTicket`, which SKIPS background Tasks (item 12: a message must not be swallowed by a Task running
 * out of sight), so it was not absorbed by the Task that had just been steered and became a SECOND request: a duplicate Task for the same words. The message line of a steer belongs to the Task it steers.
 * Written RED first.
 */
const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const STEER = 'troque a cor do fundo para azul'

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
  h.sessionMemberId = 'ana'
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
}

/** The Task's turn stays OPEN (status 'running', whenIdle waits) until `release()`; it ACCEPTS a steer and records it. Every other call of the persona is the plain fake. */
function openTurn(h: PersonaHost): { release: () => void; steers: string[] } {
  let open = true
  let release = (): void => undefined
  const gate = new Promise<void>((resolve) => { release = () => { open = false; resolve() } })
  const steers: string[] = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const inner = createFakeRunner()
    if (request?.purpose !== 'task') return Promise.resolve(inner)
    const runner: Runner = {
      ensureSession: (id, cwd, title, role) => inner.ensureSession(id, cwd, title, role),
      deliver: (sessionId, requestId, text, mode) => inner.deliver(sessionId, requestId, text, mode),
      steer: (_sessionId, _requestId, text) => { steers.push(text); return Promise.resolve(true) },
      cancel: (sessionId, options) => inner.cancel(sessionId, options),
      status: sessionId => (open ? 'running' : inner.status(sessionId)),
      whenIdle: async (sessionId) => { await gate; await inner.whenIdle(sessionId) },
      onEvent: listener => inner.onEvent(listener),
      capabilities: () => inner.capabilities(),
    }
    return Promise.resolve(runner)
  }
  return { release, steers }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })
const tickets = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list()

it('"Direcionar agora" on a Task in the BACKGROUND steers THAT Task and opens NO second one: the steer line is absorbed by the Task it steers', async () => {
  const h = host()
  seed(h)
  const book = backgroundWorkOf(h.orchestration, { afterMs: 40, nowMs: () => Date.now() })
  const turn = openTurn(h)
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia monte o cardápio da semana com preços', actorId: 'ana', subjectId: 'u1' })
  await sleep(300)
  const task = tickets(h).find(row => row.execution?.name === 'Bia')!
  expect(book.isBackground(task.id), 'the Task went to the background').toBe(true)
  const before = tickets(h).length

  const view = await h.steerWorkingTurn({ ...SCOPE, personaId: 'bia', subjectId: 'u1', streamKind: 'channel', ownerId: 'geral', text: STEER })
  await h.orchestration.flush('pp')

  expect(view).toMatchObject({ mode: 'steer', ticketId: task.id })
  expect(turn.steers, 'the open turn of the background Task took the text, once').toEqual([STEER])
  // the bug: the steer line was NOT absorbed by the Task it steered, so the host also answered/opened work for the same words
  expect(tickets(h).length, 'no second Task for the steer words').toBe(before)
  const steerLine = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.filter(row => row.id.startsWith('steer:'))
  expect(steerLine).toHaveLength(1)
  const reactions = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    .filter(row => row.id.startsWith(`coord-${steerLine[0]!.id}-`))
  expect(reactions, 'nothing is started on the steer line (no answer, no new Task): it already went into the open turn').toEqual([])
  turn.release()
  await book.whenIdle()
})

it('a steer line with NOTHING running is a plain message (it flows as before): the alignment is only for a persona whose Task runs', async () => {
  const h = host()
  seed(h)
  const before = tickets(h).length
  const view = await h.steerWorkingTurn({ ...SCOPE, personaId: 'bia', subjectId: 'geral', streamKind: 'channel', ownerId: 'geral', text: '@Bia olá, tudo bem?' })
  await h.orchestration.flush('pp')
  expect(view.mode).toBe('sent')
  expect(tickets(h).length).toBeGreaterThanOrEqual(before) // nothing was swallowed: the message is handled as any other
})
