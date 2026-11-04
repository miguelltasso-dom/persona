// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { overlayOpenFromHost } from '../src/client/remote/onboarding-host.ts'

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Result => ({ ok: true, value })

function wireHost(firstUseRef: { current: boolean }): Record<string, unknown> {
  let workspace = false
  return {
    listProjects: () => Promise.resolve(ok(workspace ? [{ id: 'proj-pessoal' }] : [])),
    createWorkspace: () => { workspace = true; return Promise.resolve(ok({ id: 'ws-persona-local' })) },
    createMember: (request: Record<string, unknown>) => Promise.resolve(ok(request)),
    listChannels: () => Promise.resolve(ok([{ id: 'geral', name: 'geral' }])),
    createChannel: (request: { id: string }) => Promise.resolve(ok({ id: request.id })),
    getOnboarding: () => Promise.resolve(ok({
      firstUse: firstUseRef.current,
      completed: !firstUseRef.current,
      personalProjectId: 'proj-pessoal',
      hasPersonalProject: true,
    })),
    ping: () => Promise.resolve(ok({ protocol: 1 })),
    getOverviewNow: () => Promise.resolve(ok({ personas: [] })),
    getWhileAway: () => Promise.resolve(ok({ events: [] })),
    getOverview: () => Promise.resolve(ok({ needsYou: [], inProgress: [] })),
    listTeam: () => Promise.resolve(ok({ personas: [{ id: 'p1', name: 'A', title: 'T', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'a', systemRoles: [], canRecruit: false }], members: [] })),
    listTasks: () => Promise.resolve(ok([])),
    listMessages: () => Promise.resolve(ok({ events: [] })),
    listDms: () => Promise.resolve(ok([])),
    markVisit: () => Promise.resolve(ok(true)),
    followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
  }
}

beforeEach(() => { localStorage.clear() })

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('onboarding overlay vs host firstUse', () => {
  it('opens overlay before listGestorPlans / listConversationSubjects settle (dest:desktop splash)', async () => {
    const firstUseRef = { current: true }
    const host = wireHost(firstUseRef)
    host.listGestorPlans = () => new Promise(() => { /* hang */ })
    host.listConversationSubjects = () => new Promise(() => { /* hang */ })
    const open: boolean[] = []
    const live = createPersonaLiveStore(host as never)
    void live.bootstrap((firstUse) => { open.push(overlayOpenFromHost(firstUse)) })
    await vi.waitFor(() => { expect(open.at(-1)).toBe(true) }, { timeout: 2_000 })
    live.dispose()
  })

  it('closes overlay when host flips firstUse after refresh (no reload)', async () => {
    const firstUseRef = { current: true }
    const host = wireHost(firstUseRef)
    const open: boolean[] = []
    const live = createPersonaLiveStore(host as never)
    await live.bootstrap((firstUse) => { open.push(overlayOpenFromHost(firstUse)) })
    expect(open.at(-1)).toBe(true)

    firstUseRef.current = false
    await live.refresh()
    expect(open.at(-1)).toBe(false)
    live.dispose()
  }, 10_000)
})
