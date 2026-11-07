/**
 * EFF-1 (D-088): the model and the "Capricho" are the person's choice, per persona. No choice = the engine's default and NOTHING is
 * sent; what the screen offers is what the ENGINE said; there is no "recommended" anywhere.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import { ConnectionProbe } from '../src/connection-probe.ts'
import { engineChoiceOf, engineModelsOf, nextRunner } from '../src/engine-menu.ts'
import PersonaHost from '../src/index.ts'
import { specFromConnection } from '../src/runner.ts'
import type { SetPersonaEngineRequest } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

const MENU = {
  models: ['default', 'opus', 'sonnet', 'haiku', 'legacy'],
  modelMenu: [
    { id: 'default', label: 'Padrão', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { id: 'opus', label: 'Opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
    { id: 'sonnet', efforts: ['low', 'medium', 'high', 'auto'] }, // `auto` is not a level the host stores: dropped, never invented
    { id: 'haiku' }, // no effort at all
    { id: 'legacy', label: 'Antigo', efforts: ['low'], disabled: true }, // listed but refused by the engine: not offered
  ],
} as const

function seed(h: PersonaHost, runner: { kind: 'dsh' | 'cli'; cli: string; model: string } = { kind: 'cli', cli: 'claude', model: 'default' }): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: runner.kind, runnerCli: runner.cli, runnerModel: runner.model,
    canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

const engine = (over: Partial<SetPersonaEngineRequest>): SetPersonaEngineRequest => ({
  ...scope, personaId: 'p1', runnerKind: 'cli', runnerCli: 'claude', runnerModel: null, ...over,
})

it('what the screen offers is what the ENGINE said: its models and levels, "Padrão do motor" levels apart, no recommended', () => {
  const menu = engineModelsOf(MENU)
  expect(menu.models).toEqual([
    { id: 'opus', label: 'Opus', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
    { id: 'sonnet', label: 'sonnet', effortLevels: ['low', 'medium', 'high'] },
    { id: 'haiku', label: 'haiku', effortLevels: [] }, // "this model has no choice of effort"
  ])
  expect(menu.defaultEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(JSON.stringify(menu)).not.toMatch(/recommend/iu)
  // An engine that gave only ids offers its models with no choice of effort (nothing is invented).
  expect(engineModelsOf({ models: ['gpt-5', 'o3'] })).toEqual({
    models: [{ id: 'gpt-5', label: 'gpt-5', effortLevels: [] }, { id: 'o3', label: 'o3', effortLevels: [] }],
    defaultEffortLevels: [],
  })
})

it('the connection card carries the menu only when the engine gave one', async () => {
  const probe = new ConnectionProbe({
    timeoutMs: 8_000, now: () => 0,
    detect: async () => [
      { id: 'claude', kind: 'cli', installed: true, loggedIn: true, ...MENU },
      { id: 'codex', kind: 'cli', installed: true, loggedIn: true, models: [] },
    ],
  })
  const cards = await probe.ready()
  const claude = cards.find(card => card.kind === 'claude')
  expect(claude?.models?.map(model => model.id)).toEqual(['opus', 'sonnet', 'haiku'])
  expect(claude?.defaultEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  const codex = cards.find(card => card.kind === 'codex')
  expect(codex).not.toHaveProperty('models') // no menu, no field: the screen says "este motor não deixa escolher"
  expect(codex).not.toHaveProperty('defaultEffortLevels')
})

it('a new persona has the engine\'s default in the model AND the capricho', () => {
  const h = host()
  seed(h)
  const card = h.getPersonaCard({ ...scope, personaId: 'p1' })
  expect(card.engine).toMatchObject({ runnerLabel: 'claude', modelLabel: 'default', runnerModel: null, runnerEffort: null })
  expect(specFromConnection(h.product.getPersona('p1')!.runner)).toStrictEqual({ kind: 'cli', cli: 'claude', model: 'default' }) // no `effort` key
})

it('the person picks any model and any level: stored, shown on the card, copied to the runner spec', () => {
  const h = host()
  seed(h)
  const card = h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'xhigh' }))
  expect(card.engine).toMatchObject({ runnerModel: 'opus', runnerEffort: 'xhigh' })
  const stored = h.product.getPersona('p1')!.runner
  expect(stored).toEqual({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'xhigh' })
  expect(specFromConnection(stored)).toEqual({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'xhigh' })
  // Nothing locks a combination the host cannot know about (the engine decides at run time and says so): a level the menu above
  // does not list is still stored.
  expect(h.setPersonaEngine(engine({ runnerModel: 'haiku', runnerEffort: 'max' })).engine.runnerEffort).toBe('max')
})

it('null is "Padrão do motor": clears the model and/or the level; left out keeps the level only while engine and model stay the same', () => {
  const h = host()
  seed(h)
  h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'high' }))
  expect(h.setPersonaEngine(engine({ runnerModel: 'opus' })).engine.runnerEffort).toBe('high') // same engine + model: kept
  expect(h.setPersonaEngine(engine({ runnerModel: 'sonnet' })).engine.runnerEffort).toBeNull() // another model: the level is not carried over
  h.setPersonaEngine(engine({ runnerModel: 'sonnet', runnerEffort: 'low' }))
  expect(h.setPersonaEngine(engine({ runnerModel: 'sonnet', runnerEffort: null })).engine.runnerEffort).toBeNull() // explicit default
  h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'low' }))
  const cleared = h.setPersonaEngine(engine({ runnerModel: null, runnerEffort: null }))
  expect(cleared.engine).toMatchObject({ modelLabel: 'default', runnerModel: null, runnerEffort: null })
  expect(h.product.getPersona('p1')!.runner).toEqual({ kind: 'cli', cli: 'claude', model: 'default' })
  // The built-in engine has no effort to choose; another CLI does not inherit this one's level.
  h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'max' }))
  expect(h.setPersonaEngine(engine({ runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', runnerEffort: 'max' })).engine.runnerEffort).toBeNull()
  h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'max' }))
  expect(h.setPersonaEngine(engine({ runnerCli: 'codex', runnerModel: 'opus' })).engine.runnerEffort).toBeNull()
})

it('a level the host does not store is refused, nothing is half-written', () => {
  const h = host()
  seed(h)
  expect(() => h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'turbo' as unknown as 'max' }))).toThrow(/esforço/iu)
  expect(h.product.getPersona('p1')!.runner).toEqual({ kind: 'cli', cli: 'claude', model: 'default' })
  expect(() => h.createPersona({
    id: 'p2', ...scope, name: 'Nina', title: 'Design', description: 'Desenha.', personality: 'Calma.', instructions: 'Capriche.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'default',
    runnerEffort: 'turbo' as unknown as 'max', canRecruit: false, createdBy: 'ana',
  })).toThrow(/esforço/iu)
})

it('pure: nextRunner / engineChoiceOf', () => {
  const previous = { kind: 'cli', cli: 'claude', model: 'opus', effort: 'high' } as const
  const base: SetPersonaEngineRequest = { ...scope, personaId: 'p1', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'opus' }
  expect(nextRunner(previous, base, 'claude')).toEqual(previous)
  expect(nextRunner(previous, { ...base, runnerModel: '  ' }, 'claude')).toEqual({ kind: 'cli', cli: 'claude', model: 'default' })
  expect(engineChoiceOf(previous)).toEqual({ runnerModel: 'opus', runnerEffort: 'high' })
  expect(engineChoiceOf({ kind: 'dsh', model: 'default' })).toEqual({ runnerModel: null, runnerEffort: null })
})

it('the choice reaches the runner of a Task turn; without a choice the spec carries no effort; a change opens a fresh session', async () => {
  const h = host()
  seed(h)
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  const scripted = h.orchestration.scripted
  const readiness = h.orchestration.engineReadinessOf
  h.orchestration.scripted = false // the real runner path: the scripted replies never open a runner
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null }) // a CLI persona waits for the probe otherwise
  const seen: Array<{ model: string; effort: string | undefined; purpose: string }> = []
  const all: string[] = []
  h.orchestration.runnerFactory = (request) => {
    all.push(`${request?.spec.kind ?? '?'}:${request?.purpose ?? '?'}`)
    if (request?.spec.kind === 'cli') seen.push({ model: request.spec.model, effort: request.spec.effort, purpose: request.purpose ?? '' })
    return Promise.resolve(createFakeRunner())
  }
  try {
    const ask = async (id: string, what: string): Promise<void> => {
      h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body: `preciso de ${what} no projeto`, actorId: 'ana', subjectId: id })
      await h.orchestration.flush('pp')
    }
    await ask('m1', 'um README')
    const first = seen.filter(row => row.purpose === 'task')
    expect(first.length, `requests: ${all.join(',')} · events: ${JSON.stringify(h.events.listProject('pp').map(event => event.body.slice(0, 80)))}`).toBeGreaterThan(0)
    expect(first.every(row => row.effort === undefined)).toBe(true) // no choice: the engine runs at its default
    const warmBefore = h.orchestration.warmRunners.size
    expect(warmBefore).toBeGreaterThan(0)
    h.setPersonaEngine(engine({ runnerModel: 'opus', runnerEffort: 'xhigh' }))
    expect(h.orchestration.warmRunners.size).toBe(0) // the session opened with the old choice is gone
    seen.length = 0
    await ask('m2', 'um CHANGELOG') // a different text: the same words twice are a duplicate
    const second = seen.filter(row => row.purpose === 'task')
    expect(second.length).toBeGreaterThan(0)
    expect(second.every(row => row.model === 'opus' && row.effort === 'xhigh')).toBe(true)
  } finally {
    h.orchestration.scripted = scripted
    h.orchestration.engineReadinessOf = readiness
  }
})
