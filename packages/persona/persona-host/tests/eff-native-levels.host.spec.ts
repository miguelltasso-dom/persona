/**
 * EFF-1 NATIVO (Miguel via Atlas, 07/11), with NO model: the screen offers the effort levels each engine ITSELF lists, by the name its CLI uses, in the
 * engine's own order. Measured on the installed CLIs (zero model): Claude 2.1.319 says low / medium / high / xhigh / max; Codex 0.166.0 says the same and,
 * on 6 of its 32 models (gpt-6.1-sol, gpt-6-astra, gpt-6.1-terra, gpt-6-sol, gpt-5.6-sol, gpt-5.6-terra), `ultra`. The host used to cut every engine to a closed
 * list of five names of its own, so those models lost `ultra` on the way to the screen (and the core refused to store it).
 *
 * What stays: a name the engine does not use (`auto`, `turbo`) is still dropped / refused; Claude never gets `ultra` (its static table has its own five).
 */
import { STATIC_EFFORT_LEVELS } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import { STATIC_CLAUDE_MENU } from '../src/claude-menu.ts'
import { ConnectionProbe } from '../src/connection-probe.ts'
import { EFFORT_LEVELS, engineModelsOf, nextRunner } from '../src/engine-menu.ts'
import type PersonaHost from '../src/index.ts'
import { specFromConnection } from '../src/runner.ts'
import type { SetPersonaEngineRequest } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-07T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

/** The shape of the real Codex menu (reduced to the models that show every case): `ultra` on the newest, fewer levels on the others, sparse lists, per-model default. */
const CODEX = {
  id: 'codex', kind: 'cli', installed: true, loggedIn: true, version: '0.166.0',
  models: ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.5', 'commandcode/glm-5.2', 'commandcode/deepseek-v4-flash'],
  modelMenu: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], defaultEffort: 'low' },
    { id: 'gpt-6-luna', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
    { id: 'gpt-5.5', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
    { id: 'commandcode/glm-5.2', efforts: ['high', 'max'], defaultEffort: 'max' },
    { id: 'commandcode/deepseek-v4-flash', efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
  ],
} as const

function seed(h: PersonaHost, runner: { kind: 'dsh' | 'cli'; cli: string; model: string }): void {
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
  ...scope, personaId: 'p1', runnerKind: 'cli', runnerCli: 'codex', runnerModel: null, ...over,
})

it('(1) the Codex card carries each model\'s levels exactly as the CLI said them: `ultra` included, the engine\'s order and its per-model default kept', async () => {
  const probe = new ConnectionProbe({ timeoutMs: 8_000, now: () => 0, detect: async () => [CODEX as never] })
  const card = (await probe.ready()).find(item => item.kind === 'codex')
  expect(card?.models?.map(model => [model.id, model.effortLevels, model.defaultEffort])).toEqual([
    ['gpt-6.1-sol', ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], 'low'],
    ['gpt-6-luna', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium'],
    ['gpt-5.5', ['low', 'medium', 'high', 'xhigh'], 'medium'],
    ['commandcode/glm-5.2', ['high', 'max'], 'max'],
    ['commandcode/deepseek-v4-flash', ['low', 'high', 'max'], 'high'],
  ])
})

it('(2) the names are the engine\'s, never renamed or invented: a name the engine does not use is dropped, and the list always reads lightest → heaviest', () => {
  const menu = engineModelsOf({
    models: ['x', 'y'],
    modelMenu: [
      { id: 'x', efforts: ['ultra', 'low', 'turbo', 'auto', 'max', 'low'] }, // a made-up order, two foreign names, a repeat
      { id: 'y', efforts: ['low', 'high', 'max'], defaultEffort: 'high' }, // a sparse list, as some Codex models have
    ],
  })
  expect(menu.models.map(model => model.effortLevels)).toEqual([['low', 'max', 'ultra'], ['low', 'high', 'max']])
  expect(menu.models[1]?.defaultEffort).toBe('high')
})

it('(3) the host\'s names ARE the runners\' static table (one list, no second naming), and Claude never gets `ultra` from its own static table', () => {
  const union = [...new Set([...STATIC_EFFORT_LEVELS.claude, ...STATIC_EFFORT_LEVELS.codex])]
  expect([...EFFORT_LEVELS]).toEqual(union)
  expect(STATIC_EFFORT_LEVELS.claude).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  for (const entry of STATIC_CLAUDE_MENU) expect(entry.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

it('(4) a Codex persona set to `ultra`: the core stores it, the card shows it, the runner spec carries it; `turbo` is still refused with the "esforço" words', () => {
  const h = host()
  seed(h, { kind: 'cli', cli: 'codex', model: 'default' })
  const card = h.setPersonaEngine(engine({ runnerModel: 'gpt-6.1-sol', runnerEffort: 'ultra' }))
  expect(card.engine).toMatchObject({ runnerModel: 'gpt-6.1-sol', runnerEffort: 'ultra' })
  const stored = h.product.getPersona('p1')!.runner
  expect(stored).toEqual({ kind: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'ultra' })
  expect(specFromConnection(stored)).toEqual({ kind: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'ultra' })
  expect(() => h.setPersonaEngine(engine({ runnerModel: 'gpt-6.1-sol', runnerEffort: 'turbo' as unknown as 'max' }))).toThrow(/esforço/iu)
  expect(h.product.getPersona('p1')!.runner).toEqual({ kind: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'ultra' }) // the refused call wrote nothing
})

it('(5) the level follows the engine AND the model: changing the model clears an `ultra` the new model may not have (the person never gets a choice they did not make)', () => {
  const previous = { kind: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'ultra' } as const
  const base: SetPersonaEngineRequest = { ...scope, personaId: 'p1', runnerKind: 'cli', runnerCli: 'codex', runnerModel: 'gpt-6.1-sol' }
  expect(nextRunner(previous, base, 'codex')).toEqual(previous) // same engine + model: kept
  expect(nextRunner(previous, { ...base, runnerModel: 'gpt-5.5' }, 'codex')).toEqual({ kind: 'cli', cli: 'codex', model: 'gpt-5.5' })
  expect(nextRunner(previous, { ...base, runnerEffort: null }, 'codex')).toEqual({ kind: 'cli', cli: 'codex', model: 'gpt-6.1-sol' }) // explicit "Padrão do motor"
})
