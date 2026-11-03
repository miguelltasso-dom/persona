// @vitest-environment jsdom
// Keel P0: ctx.remote.persona resolves RemoteResult; the live store must unwrap once (persona-remote-unwrap.ts).
// A fake host that ONLY speaks RemoteResult drives bootstrap → refresh → dev seed, plus the failure path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { isRemoteResult, PersonaRemoteError, unwrapPersonaRemote } from '../src/client/remote/persona-remote-unwrap.ts'

type Json = Record<string, unknown>
type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }

const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

/** In-memory host whose every method resolves to a RemoteResult (like the generated Remote). */
function fakeHost(options: { failOn?: string } = {}): Json {
  const personas: Json[] = []
  const messages: Json[] = []
  const approvals: Json[] = []
  let onboarded = false
  let workspace = false
  const host: Record<string, (request: Json) => Promise<Result> | AsyncIterable<unknown>> = {
    listProjects: () => (workspace ? ok([{ id: 'proj-pessoal', name: 'Pessoal', kind: 'personal' }]) : Promise.resolve({ ok: false, error: { code: 'not_found', message: 'workspace inexistente' } })),
    createWorkspace: () => { workspace = true; return ok({ id: 'ws-persona-local' }) },
    createMember: request => ok({ id: request.id, displayName: request.displayName }),
    listChannels: () => ok([{ id: 'ch-geral', name: 'geral' }]),
    createChannel: request => ok({ id: request.id, name: request.name }),
    getOnboarding: () => ok({ firstUse: !onboarded, completed: onboarded, personalProjectId: 'proj-pessoal' }),
    completeOnboarding: (request) => {
      onboarded = true
      for (const [index, row] of ((request.team as Json[] | undefined) ?? []).entries()) {
        personas.push({ id: `p-${index}`, name: row.name, title: row.title, avatarRef: row.avatarRef, systemRoles: [] })
      }
      return ok({ completed: true })
    },
    createPersona: (request) => { personas.push({ ...request }); return ok(request) },
    listTeam: () => ok({ personas: [...personas], members: [{ id: 'member-owner', displayName: 'Miguel' }] }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTasks: () => ok([]),
    listDms: () => ok([]),
    listApprovals: () => ok([...approvals]),
    proposeHire: (request) => { approvals.push({ ...request, status: 'pending' }); return ok(request) },
    listMessages: () => ok({ events: [...messages] }),
    postMessage: (request) => { messages.push({ ...request, occurredAt: request.occurredAt ?? '2026-11-03T14:00:00.000Z' }); return ok(request) },
    markVisit: () => ok(true),
    followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle stream */ } }),
  }
  if (options.failOn !== undefined) {
    const name = options.failOn
    host[name] = () => Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'host fora do ar' } })
  }
  return host as unknown as Json
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('persona remote unwrap proxy', () => {
  it('no proxied method resolves to a raw RemoteResult', async () => {
    const host = fakeHost()
    const proxy = unwrapPersonaRemote(host) as unknown as Record<string, (request: Json) => unknown>
    await proxy.createWorkspace!({})
    for (const name of Object.keys(host)) {
      if (name === 'followMessages') continue
      const value = await proxy[name]!({ team: [], id: 'x', name: 'n' })
      expect(isRemoteResult(value), name).toBe(false)
    }
  })

  it('a failed RemoteResult rejects with a typed pt-BR PersonaRemoteError', async () => {
    const proxy = unwrapPersonaRemote(fakeHost({ failOn: 'listChannels' })) as unknown as Record<string, (request: Json) => Promise<unknown>>
    const error = await proxy.listChannels!({}).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PersonaRemoteError)
    expect((error as PersonaRemoteError).code).toBe('unavailable')
    expect((error as Error).message).toContain('O host da Persona não conseguiu concluir "listChannels"')
    expect((error as Error).message).toContain('host fora do ar')
  })
})

describe('live store over a RemoteResult host', () => {
  it('bootstrap → refresh → dev seed populates team and #geral', async () => {
    localStorage.setItem('persona.devSeed.v1', '1')
    const live = createPersonaLiveStore(fakeHost() as never)
    let firstUse: boolean | undefined
    await live.bootstrap((value) => { firstUse = value })
    expect(live.observable.getSnapshot().error).toBeNull()
    expect(live.observable.getSnapshot().ready).toBe(true)
    expect(firstUse).toBe(true)
    await live.runDevHarnessSeedIfEnabled()
    await settle()
    const snapshot = live.observable.getSnapshot()
    expect(snapshot.error).toBeNull()
    expect(snapshot.stripMembers.map(member => member.name)).toEqual(expect.arrayContaining(['Atlas', 'Bento', 'Nina', 'Sol', 'Luna']))
    expect(snapshot.messages.length).toBeGreaterThanOrEqual(4)
    expect(snapshot.attentionTitles).toContain('Aprovar envio do contrato')
  })

  it('host failure surfaces a readable error instead of "x.find is not a function"', async () => {
    const live = createPersonaLiveStore(fakeHost({ failOn: 'listChannels' }) as never)
    await live.bootstrap(() => undefined)
    const error = live.observable.getSnapshot().error
    expect(error).toContain('O host da Persona não conseguiu concluir "listChannels"')
    expect(error).not.toContain('is not a function')
  })
})
