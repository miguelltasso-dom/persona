/**
 * P0-05 (Carbon, colheita-s1), the host half: the warm runner of a persona outlived the browser grant it was opened with.
 *  - the key of `warmRunners` did not carry the browser, so a persona whose profile was revoked got, on her next Task, the warm runner of the last one with `mcp__browser__*` still connected
 *    to the Chrome; and a runner opened without the browser kept serving a Task that carries it;
 *  - `browserOf` opened the lease BEFORE the cache hit and a hit returned without giving it back (the profile's turn lock leaked);
 *  - `revokeBrowserProfile` / `closeBrowserProfile` did not evict the warm runners of the personas that had the profile.
 * No real CLI, no Chrome: the runner factory and the browser opener are fakes.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeRunner, type FakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished, vi } from 'vitest'
import type { BrowserService } from '../src/browser/service.ts'
import { openTurnBrowser, type TurnBrowser } from '../src/browser/turn-browser.ts'
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

it('a warm hit keeps the lease it just took for the runner that serves the Task, and the runner gives it back at its next turn event (P0-01: it was handed back at once, before the Task began)', async () => {
  const h = host()
  seed(h)
  const state = rig(h)
  const first = await resolve(h)
  const second = await resolve(h)
  expect(second).toBe(first) // the second Task is served by the same warm runner…
  expect(state.built).toHaveLength(1)
  // …and the turn the hit just took is HERS for the Task about to run (RED today: `browser?.release()` handed it back before the Task began, so she drove the Chrome with no turn at all).
  expect({ acquired: state.acquired, released: state.released }).toEqual({ acquired: 2, released: 0 })
  h.orchestration.evictWarmRunners('pp', 'bia') // the runner's end (an idle/error event, an eviction) gives back what it holds: the latest lease, the same turn of the same profile
  expect(state.released).toBe(1)
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

/**
 * P0-01 (Carbon, colheita-s1-fix): the REAL turn logic of the browser service (take, pin by the live Chrome, release) with a fake Chrome and a clock the spec moves. One profile granted to Bia and
 * Téo; Bia's warm runner opened with the browser, her first Task ends (the lease goes back), and a second Task of hers finds both the warm runner and the Chrome already open.
 */
let profileCount = 0
function realRig(h: PersonaHost): { readonly profileId: string; readonly name: string; readonly service: BrowserService; readonly clock: { now: number } } {
  const service = h.browser.service
  const clock = { now: Date.parse('2026-11-12T12:00:00.000Z') }
  const deps = (service as unknown as { deps: { chrome?: unknown; launch?: unknown; now?: () => number } }).deps
  deps.chrome = () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157' })
  deps.launch = () => Promise.resolve({ port: 9222, version: '157', close: () => Promise.resolve() })
  deps.now = () => clock.now
  profileCount += 1
  const name = `Loja quente ${String(profileCount)}`
  h.browser.create(name)
  const profileId = service.profiles().find(profile => profile.name === name)!.id
  h.createPersona({
    ...SCOPE, id: 'teo', name: 'Téo', title: 'Pesquisa', description: 'Pesquisa.', personality: 'Calma.', instructions: 'Faça.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: [],
  })
  h.browser.grant('bia', profileId)
  h.browser.grant('teo', profileId)
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner({ holdUntilIdle: true }))
  h.orchestration.browserOf = async personaId => await openTurnBrowser({ service, personaId, profileName: name, serverPath: 'C:\\app\\mcp.js' })
  return { profileId, name, service, clock }
}

const bia = { kind: 'persona', id: 'bia' } as const
const teo = { kind: 'persona', id: 'teo' } as const

it('P0-01 (service): a Task that finds the Chrome already open is pinned as its opener again, so the profile does not lapse to another persona in the middle of her work', async () => {
  const h = host()
  seed(h)
  const { profileId, name, service, clock } = realRig(h)
  await service.sessionFor('bia', name) // Task 1 opens the Chrome and pins the turn
  service.releaseTurn(profileId, bia) // Task 1 ends: the turn and the pin go back, the Chrome stays up
  expect(service.holderOf(profileId)).toBeUndefined()
  await service.sessionFor('bia', name) // Task 2: the Chrome is already open
  clock.now += 10 * 60_000 // a long Task: far past the idle lapse
  expect(service.holderOf(profileId)).toEqual(bia) // RED today: `open()` returned early without pinning, so the turn lapsed and any other persona could take the page
  expect(service.takeTurn(profileId, teo)).toMatchObject({ ok: false })
})

it('P0-01 (host): the second Task of a persona that hits her warm runner keeps the turn of the profile: Téo cannot drive the same Chrome meanwhile, and the runner gives the turn back at its next event', async () => {
  const h = host()
  seed(h)
  const { profileId, service, clock } = realRig(h)
  const first = await resolve(h, 't1')
  const runner = first as unknown as FakeRunner
  await runner.ensureSession('s1', '.', 'Tarefa 1', 'worker')
  await runner.deliver('s1', 'r1', 'faça o pedido', 'queue')
  await runner.cancel('s1', { keepInbox: false }) // Task 1 ends (the fake emits `idle`, as a CLI does): the lease goes back
  expect(service.holderOf(profileId)).toBeUndefined()
  const second = await resolve(h, 't2') // Task 2: the warm runner, the Chrome still open
  expect(second).toBe(first)
  // RED today: the hit handed the turn it had just taken straight back (`browser?.release()`): Bia ran the whole Task with no turn on the profile…
  expect(service.holderOf(profileId)).toEqual(bia)
  // …so Téo could take the same Chrome while she clicked and typed in it.
  expect(service.takeTurn(profileId, teo)).toMatchObject({ ok: false })
  clock.now += 10 * 60_000
  expect(service.holderOf(profileId)).toEqual(bia)
  await runner.ensureSession('s2', '.', 'Tarefa 2', 'worker')
  await runner.deliver('s2', 'r2', 'faça o outro pedido', 'queue')
  await runner.cancel('s2', { keepInbox: false }) // Task 2 ends: the lease it kept goes back with the runner's event
  expect(service.holderOf(profileId)).toBeUndefined()
  expect(service.takeTurn(profileId, teo)).toMatchObject({ ok: true })
})

/** What the turn's own browser hook does with the host as wired (no rig): the Chrome is a counter, nothing opens. */
async function turnBrowserOf(h: PersonaHost): Promise<{ readonly browser: TurnBrowser | undefined; readonly launched: number; readonly holder: string | undefined }> {
  const service = h.browser.service
  let launched = 0
  const deps = (service as unknown as { deps: { chrome?: unknown; launch?: unknown } }).deps
  deps.chrome = () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157' })
  deps.launch = () => { launched += 1; return Promise.resolve({ port: 9222, version: '157', close: () => Promise.resolve() }) }
  profileCount += 1
  const name = `Loja gate ${String(profileCount)}`
  h.browser.create(name)
  const profileId = service.profiles().find(profile => profile.name === name)!.id
  for (const profile of service.profiles()) if (profile.id !== profileId) h.browser.revoke('bia', profile.id) // the host is one per file: the profiles of the earlier tests are not hers now (the first granted one is her default)
  h.browser.grant('bia', profileId)
  const browser = await h.orchestration.browserOf?.('bia', 'claude')
  return { browser, launched, holder: service.holderOf(profileId)?.id }
}

it('D-113: with the shared-browser surface OFF the turn gets no browser at all (no Chrome opened, no profile turn taken); ON, the same call opens it', async () => {
  // Two hosts of their own (the file's shared host keeps the `browserOf` the other tests rigged): the switch is resolved at boot, from the environment, like the installed app does.
  const dir = mkdtempSync(join(tmpdir(), 'd113-browser-'))
  onTestFinished(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* the hosts close their databases after the test; a leftover temp folder is harmless */ } })
  vi.stubEnv('PERSONA_SURFACE_SHARED_BROWSER', '0')
  let off: PersonaHost
  try {
    off = host(join(dir, 'off.db'))
  } finally {
    vi.unstubAllEnvs()
  }
  seed(off)
  expect(off.surfaces.sharedBrowser).toBe(false)
  expect(await turnBrowserOf(off)).toEqual({ browser: undefined, launched: 0, holder: undefined })
  const on = host(join(dir, 'on.db'))
  seed(on)
  expect(on.surfaces.sharedBrowser).toBe(true) // Vitest default: the suites keep proving the code
  const opened = await turnBrowserOf(on)
  expect(opened.browser).toBeDefined()
  expect(opened).toMatchObject({ launched: 1, holder: 'bia' })
})
