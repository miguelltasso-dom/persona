/**
 * The isolation proof of the CLI (answer-only mode) is warmed ONCE per CLI version and model set, the moment the engine is ready, so the
 * first delivery of a fresh install does not wait for it (Tally, B). Zero model, never blocks, never at construction. The model arguments are
 * exactly the ones the runner will use for each persona.
 */
import { afterEach, expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ConnectionView } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLAUDE: ConnectionView = { id: 'claude', kind: 'claude', available: true, loggedIn: true, loginHint: '', phase: 'ready', version: '2.1.318' }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function workspace(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
}

function persona(h: PersonaHost, id: string, model: string, cli: 'claude' | 'codex' = 'claude'): void {
  h.createPersona({
    id, workspaceId: 'ws', projectId: 'pp', name: id.toUpperCase(), title: 'Time', description: 'Faz.', personality: 'Clara.',
    instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: '', runnerKind: 'cli', runnerCli: cli, runnerModel: model, canRecruit: false, createdBy: 'ana',
  })
}

/** The real boot (not a scripted host), the cards the probe reports, and a fake proof that records what it was asked. */
function boot(h: PersonaHost, cards: readonly ConnectionView[]): { calls: string[][]; list: (next: readonly ConnectionView[]) => void; fire: () => void } {
  vi.stubEnv('PERSONA_REAL_CLI', '1')
  const list = vi.spyOn(h.connections, 'list').mockReturnValue([...cards])
  const calls: string[][] = []
  h.prewarmIsolation = (modelArgs) => { calls.push([...modelArgs]); return Promise.resolve([]) }
  return {
    calls,
    list: (next) => { list.mockReturnValue([...next]) },
    fire: () => { (h as unknown as { handleReadyEngines: () => void }).handleReadyEngines() },
  }
}

it('the proof is started ONCE when the engine is ready, for the exact models the personas use, and not again on the next call', () => {
  const h = host()
  workspace(h)
  for (const [id, model] of [['p0', 'haiku'], ['p1', 'default'], ['p2', 'haiku']] as const) persona(h, id, model)
  const { calls, fire } = boot(h, [CLAUDE])
  fire()
  expect(calls).toEqual([['default', 'haiku']]) // each model argument once, no repetition
  fire()
  fire()
  expect(calls).toHaveLength(1)
})

it('a new CLI version proves again; a new model proves again; no logged-in claude or a persona on another CLI proves nothing', () => {
  const h = host()
  workspace(h)
  persona(h, 'p0', 'haiku')
  persona(h, 'p9', 'gpt-5', 'codex') // another CLI: not this proof
  const run = boot(h, [CLAUDE])
  run.fire()
  run.list([{ ...CLAUDE, version: '2.2.0' }]) // the CLI was updated
  run.fire()
  persona(h, 'p1', 'default') // a persona on another model
  run.fire()
  run.list([{ ...CLAUDE, version: '2.2.0', loggedIn: false }]) // logged out: nothing to prove
  persona(h, 'p2', 'opus')
  run.fire()
  expect(run.calls).toEqual([['haiku'], ['haiku'], ['default', 'haiku']])
})

it('nobody uses claude yet: nothing is warmed', () => {
  const h = host()
  workspace(h)
  const run = boot(h, [CLAUDE])
  run.fire()
  expect(run.calls).toEqual([])
})

it('a failing proof never reaches the boot', async () => {
  const h = host()
  workspace(h)
  persona(h, 'p0', 'haiku')
  const run = boot(h, [CLAUDE])
  h.prewarmIsolation = () => Promise.reject(new Error('travou'))
  expect(() => { run.fire() }).not.toThrow()
  await new Promise(resolve => setTimeout(resolve, 20)) // an unhandled rejection would fail the run
})

it('a scripted host (the tests, PERSONA_SCRIPTED) never warms anything', () => {
  const h = host()
  workspace(h)
  persona(h, 'p0', 'haiku')
  const calls: string[][] = []
  vi.spyOn(h.connections, 'list').mockReturnValue([CLAUDE])
  h.prewarmIsolation = (modelArgs) => { calls.push([...modelArgs]); return Promise.resolve([]) }
  ;(h as unknown as { handleReadyEngines: () => void }).handleReadyEngines() // PERSONA_REAL_CLI is not set: this host is scripted
  expect(calls).toEqual([])
})
