/**
 * P0-05 (Carbon, colheita-s1), the host half: the warm runner of a persona outlived the browser grant it was opened with.
 *  - the key of `warmRunners` did not carry the browser, so a persona whose profile was revoked got, on her next Task, the warm runner of the last one with `mcp__browser__*` still connected
 *    to the Chrome; and a runner opened without the browser kept serving a Task that carries it;
 *  - `browserOf` opened the lease BEFORE the cache hit and a hit returned without giving it back (the profile's turn lock leaked);
 *  - `revokeBrowserProfile` / `closeBrowserProfile` did not evict the warm runners of the personas that had the profile.
 * No real CLI, no Chrome: the runner factory and the browser opener are fakes.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import type { TurnBrowser } from '../src/browser/turn-browser.ts'
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

interface Rig {
  readonly built: { readonly servers: readonly string[] }[]
  acquired: number
  released: number
  browserOn: boolean
}

function rig(h: PersonaHost): Rig {
  const state: Rig = { built: [], acquired: 0, released: 0, browserOn: true }
  h.orchestration.browserOf = (): Promise<TurnBrowser | undefined> => {
    if (!state.browserOn) return Promise.resolve(undefined)
    state.acquired += 1
    return Promise.resolve({ server: { name: 'browser', command: 'node', args: ['x'] }, release: () => { state.released += 1 } } as unknown as TurnBrowser)
  }
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    if (request?.purpose === 'task') state.built.push({ servers: (request.extraMcpServers ?? []).map(server => server.name) })
    return Promise.resolve(createFakeRunner())
  }
  return state
}

/** The runner of one Task of Bia, the way the host resolves it before a turn (a message would be absorbed by the open Task, so the resolve is driven directly). */
function resolve(h: PersonaHost, ticketId = 't1'): Promise<unknown> {
  const call = (h.orchestration as unknown as { resolveFor(persona: unknown, projectId: string, mode: string, purpose: string, onFirstToken: undefined, answerOnly: boolean, ticketId: string): Promise<unknown> }).resolveFor
  return call.call(h.orchestration, h.product.getPersona('bia'), 'pp', 'asked', 'task', undefined, false, ticketId)
}

const warmOf = (h: PersonaHost): string[] => [...h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:bia:task'))

it('a persona whose browser is gone does not get the warm runner that still has it: the next Task opens a fresh one WITHOUT the server', async () => {
  const h = host()
  seed(h)
  const state = rig(h)
  const first = await resolve(h)
  expect(state.built.map(row => row.servers)).toEqual([['browser']])
  state.browserOn = false // the grant was revoked (or the profile closed)
  const second = await resolve(h)
  expect(state.built.map(row => row.servers)).toEqual([['browser'], []]) // RED today: the second Task is served by the warm runner with the Chrome still attached
  expect(second).not.toBe(first)
})

it('a runner opened without the browser is not handed to a Task that carries it', async () => {
  const h = host()
  seed(h)
  const state = rig(h)
  state.browserOn = false
  const first = await resolve(h)
  state.browserOn = true
  const second = await resolve(h)
  expect(state.built.map(row => row.servers)).toEqual([[], ['browser']])
  expect(second).not.toBe(first)
})

it('a warm hit gives the browser lease back: the lock of the profile is not held by a Task that never used it', async () => {
  const h = host()
  seed(h)
  const state = rig(h)
  const first = await resolve(h)
  const second = await resolve(h)
  expect(second).toBe(first) // the second Task is served by the same warm runner…
  expect(state.built).toHaveLength(1)
  expect({ acquired: state.acquired, released: state.released }).toEqual({ acquired: 2, released: 1 }) // …and only the lease of the runner that holds the browser is still out (RED today: nothing released)
})

it('revoking a profile evicts the warm runner of that persona (and gives its lease back); closing the profile does the same for whoever holds it', async () => {
  const h = host()
  seed(h)
  const state = rig(h)
  // The profile store is a folder shared by every in-memory host of the run (and a grant for "bia" left in it makes OTHER specs try to open a real Chrome): the host's browser is stubbed here, only
  // what the remotes DO with the warm runners is under test.
  vi.spyOn(h.browser, 'revoke').mockImplementation(() => undefined)
  vi.spyOn(h.browser, 'close').mockResolvedValue(undefined)
  vi.spyOn(h.browser, 'view').mockReturnValue({ profiles: [{ id: 'p1', name: 'Loja', running: false, personas: ['bia'], defaultsFor: [] }] })
  await resolve(h)
  expect(warmOf(h).length).toBeGreaterThan(0)
  h.revokeBrowserProfile({ ...SCOPE, personaId: 'bia', profileId: 'p1' })
  expect(warmOf(h)).toEqual([]) // RED before the fix: the runner stayed warm with the Chrome attached
  expect(state.released).toBe(state.acquired)

  await resolve(h)
  expect(warmOf(h).length).toBeGreaterThan(0)
  await h.closeBrowserProfile({ ...SCOPE, profileId: 'p1' })
  expect(warmOf(h)).toEqual([])
  expect(state.released).toBe(state.acquired)
})
