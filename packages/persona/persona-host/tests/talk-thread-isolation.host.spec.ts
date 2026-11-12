/**
 * P0-07 (Carbon, colheita-s1), first half: ONE warm talk runner per persona, with ONE native CLI thread (`withThreadResume({ shared: true })`, thread ''), served EVERY conversation: the private DMs, the
 * channels, the subjects, the sides, the fan-outs, the opinions and the indicators all resumed the same CLI history. What a person told Bia in her private DM was in the context of the next
 * answer to anybody. Now a conversation reply gets a runner of its OWN conversation (`HostRunnerRequest.thread`), and the answer-only calls (aside, opinion, indicator) are one-shot: each its own thread.
 * No real CLI: the runner factory is a fake that records what it was asked for.
 */
import { createFakeRunner, type Runner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { resolveHostRunner, type HostRunnerRequest } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

/** What the host gave `withThreadResume` for each runner it opened (the module is spied, not replaced). */
const chosen: { shared: boolean; thread?: string }[] = []
vi.mock('@deepseek-ai/dsh-persona-runners', async (original) => {
  const real = await original<typeof import('@deepseek-ai/dsh-persona-runners')>()
  return { ...real, withThreadResume: (turn: Parameters<typeof real.withThreadResume>[0], options: { shared: boolean; thread?: string }) => { chosen.push(options); return real.withThreadResume(turn, options) } }
})

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
  h.createDm({ id: 'dm-ana-bia', ...SCOPE, participantA: 'ana', participantB: 'bia' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1) {
    await h.orchestration.flush('pp')
    await new Promise<void>((resolve) => { setTimeout(resolve, 10) })
  }
}

it('the reply in a private DM and the reply in #geral are served by runners of their OWN conversation (never one shared thread)', async () => {
  const h = host()
  seed(h)
  const asked: { purpose: string | undefined; thread: string | undefined }[] = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    asked.push({ purpose: request?.purpose, thread: request?.thread })
    return Promise.resolve(createFakeRunner())
  }
  h.postMessage({ id: 'd1', ...SCOPE, streamKind: 'dm', ownerId: 'dm-ana-bia', body: 'oi Bia, o código do cofre é 4417, guarda só para você', actorId: 'ana', subjectId: 'd1' })
  await settle(h)
  h.postMessage({ id: 'g1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Bia oi, tudo bem por aí?', actorId: 'ana', subjectId: 'g1' })
  await settle(h)
  const talks = asked.filter(row => row.purpose === 'talk' && row.thread !== undefined)
  expect(talks.map(row => row.thread).sort()).toEqual(['channel:geral', 'dm:dm-ana-bia']) // RED today: one runner, no thread at all
  const warm = [...h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:bia:talk') && !key.endsWith(':answer-only'))
  expect(warm).toHaveLength(2)
})

it('two replies of the SAME conversation share the one runner of that conversation (its history is the point)', async () => {
  const h = host()
  seed(h)
  const asked: string[] = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    if (request?.purpose === 'talk' && request.thread !== undefined) asked.push(request.thread)
    return Promise.resolve(createFakeRunner())
  }
  h.postMessage({ id: 'd1', ...SCOPE, streamKind: 'dm', ownerId: 'dm-ana-bia', body: 'oi Bia, tudo bem?', actorId: 'ana', subjectId: 'd1' })
  await settle(h)
  h.postMessage({ id: 'd2', ...SCOPE, streamKind: 'dm', ownerId: 'dm-ana-bia', body: 'e como foi o dia na padaria?', actorId: 'ana', subjectId: 'd2' })
  await settle(h)
  expect(asked).toEqual(['dm:dm-ana-bia']) // built once, reused
})

describe('the host runner decides the thread of its turns by what the runner serves', () => {
  const previous = process.env.PERSONA_REAL_CLI
  beforeEach(() => { process.env.PERSONA_REAL_CLI = '1'; chosen.length = 0 })
  afterEach(() => { if (previous === undefined) delete process.env.PERSONA_REAL_CLI; else process.env.PERSONA_REAL_CLI = previous })

  const request = (over: Partial<HostRunnerRequest>): HostRunnerRequest => ({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', autonomy: 'on_request', personId: 'bia', purpose: 'talk', projectId: 'pp', ...over,
  })
  // The resolved turn runner is never driven here: only the options the host gives `withThreadResume` are under test (the behavior of the wrapper itself is in persona-runners/tests/thread-resume*.spec.ts).
  const resolve = (): Promise<Runner> => Promise.resolve({} as unknown as Runner)
  const open = (over: Partial<HostRunnerRequest>): Promise<Runner> => resolveHostRunner(request(over), { resolveRunner: resolve as never, createFakeRunner })

  it('a talk runner of ONE conversation is stamped with it (every turn of it resumes that conversation, nothing else)', async () => {
    await open({ thread: 'dm:dm-ana-bia' })
    expect(chosen).toEqual([{ shared: true, thread: 'dm:dm-ana-bia' }])
  })

  it('an answer-only talk runner (aside, opinion, indicator) keeps every call on a thread of its own: no shared history', async () => {
    await open({})
    expect(chosen).toEqual([{ shared: false }]) // RED today: { shared: true } = one thread for every call and every conversation
  })

  it('a Task runner keeps one thread per Task, as before', async () => {
    await open({ purpose: 'task' })
    expect(chosen).toEqual([{ shared: false }])
  })
})
