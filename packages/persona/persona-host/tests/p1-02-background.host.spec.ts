/**
 * P1-02 (Carbon, colheita-s1), item 12 in the ordinary road: a Task the owner asks for in #geral or a DM is chained straight into the work chain by `ingest` — only `driveTicket` ran Tasks through
 * `backgroundWork.run` — so a normal request NEVER went to the background past the threshold: the persona stayed busy in the channel until it ended; and once a Task IS in the background the persona
 * is free, yet every new message was still met with "Estou terminando …" as if she were busy. No real CLI: the runner is a fake whose Task turn we hold open.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import { backgroundWorkOf } from '../src/background-work.ts'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
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
