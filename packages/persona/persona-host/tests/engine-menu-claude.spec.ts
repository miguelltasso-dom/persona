/**
 * EFF-1 (Atlas 06:21: it does NOT leave the cut off): the model and the "Capricho" a person picks per persona come from the ENGINE's own menu. The host's
 * connection probe gave Codex's menu and NOTHING for Claude; Claude's own `initialize` (a control request: no model, no spend) lists every model with its effort
 * levels. The host reads it once per version, and when the CLI does not answer it uses the static table and says so (`source`: `cli` | `static`, which the
 * screen does not show). Real shape verified on the installed claude 2.1.318 (13 models, 5 levels, Opus 4.6 / Sonnet 4.6 without `xhigh`, haiku-4-5 with none).
 */
import type { ConnectionSnapshot } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import { menuFromInitialize, readClaudeMenu, STATIC_CLAUDE_MENU, type EngineMenu } from '../src/claude-menu.ts'
import { ConnectionProbe } from '../src/connection-probe.ts'
import { it } from './host-harness.ts'

/** The `models` of a real `initialize`, reduced to the fields the host reads. */
const INITIALIZE = {
  account: { email: 'x' },
  models: [
    { value: 'default', displayName: 'Default (recommended)', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'opus', displayName: 'Opus', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'sonnet', displayName: 'Sonnet', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', supportsThinkingOff: true },
    { value: 'claude-opus-4-6', displayName: 'Opus 4.6', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
  ],
}

const claude = (extra: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot => ({ id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: [], version: '2.1.318', ...extra })
const codex: ConnectionSnapshot = {
  id: 'codex', kind: 'cli', installed: true, loggedIn: true, version: '0.166.0', models: ['gpt-6-sol'],
  modelMenu: [{ id: 'gpt-6-sol', label: 'GPT-6 Sol', efforts: ['low', 'medium', 'high'] }],
}

it('the menu is read from what the CLI said: each model with the levels it accepts, none invented, a model with no level has no choice of effort', () => {
  const entries = menuFromInitialize(INITIALIZE)
  expect(entries.map(entry => entry.id)).toEqual(['default', 'opus', 'sonnet', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'])
  expect(entries.find(entry => entry.id === 'opus')).toEqual({ id: 'opus', label: 'Opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] })
  expect(entries.find(entry => entry.id === 'claude-opus-4-6')?.efforts).toEqual(['low', 'medium', 'high', 'max']) // the engine's own difference, kept
  expect(entries.find(entry => entry.id === 'claude-haiku-4-5-20251001')).not.toHaveProperty('efforts') // no level listed = no choice
  expect(menuFromInitialize({ models: [{ value: 'x', supportedEffortLevels: ['low', 'turbo', 7] }] })[0]?.efforts).toEqual(['low']) // only levels the host stores
  expect(menuFromInitialize({})).toEqual([])
  expect(menuFromInitialize({ models: [null, 3, { displayName: 'sem value' }] })).toEqual([])
})

it('the CLI answers → source "cli"; the CLI does not (missing, slow, a version that lists no models) → the static table, marked "static"; it never throws', async () => {
  const closed: string[] = []
  const answering = { open: () => ({ request: () => Promise.resolve(INITIALIZE), close: () => { closed.push('a'); return Promise.resolve() } }) }
  expect((await readClaudeMenu(answering)).source).toBe('cli')
  expect(closed).toEqual(['a']) // the control session is always closed
  const missing = await readClaudeMenu({ open: () => { throw new Error('claude: command not found') } })
  expect(missing).toEqual({ entries: STATIC_CLAUDE_MENU, source: 'static' })
  const silent = await readClaudeMenu({ open: () => ({ request: () => Promise.resolve({ account: {} }), close: () => Promise.resolve() }) })
  expect(silent.source).toBe('static') // an answer with no models is no answer
  const slow = await readClaudeMenu({ timeoutMs: 20, open: () => ({ request: () => new Promise(() => undefined), close: () => Promise.resolve() }) })
  expect(slow.source).toBe('static')
})

it('the static table offers every level the host stores for every model, and no "recommended", no model fixed by us', () => {
  expect(STATIC_CLAUDE_MENU.map(entry => entry.id)).toEqual(['default', 'opus', 'sonnet', 'fable', 'haiku'])
  for (const entry of STATIC_CLAUDE_MENU) expect(entry.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(JSON.stringify(STATIC_CLAUDE_MENU).toLowerCase()).not.toContain('recommend')
})

it('the connection card of Claude carries the models and the levels (with "Padrão do motor" levels apart), source "cli"; Codex keeps what its own detection said', async () => {
  let asked = 0
  const probe = new ConnectionProbe({
    detect: () => Promise.resolve([claude(), codex]),
    claudeMenu: () => { asked += 1; return Promise.resolve({ entries: menuFromInitialize(INITIALIZE), source: 'cli' } satisfies EngineMenu) },
  })
  const cards = await probe.ready()
  const card = cards.find(row => row.id === 'claude')
  expect(card?.source).toBe('cli')
  expect(card?.models?.map(model => model.id)).toEqual(['opus', 'sonnet', 'claude-haiku-4-5-20251001', 'claude-opus-4-6']) // "default" is not a row: the screen always offers it
  expect(card?.models?.find(model => model.id === 'opus')).toMatchObject({ label: 'Opus', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] })
  expect(card?.models?.find(model => model.id === 'claude-haiku-4-5-20251001')?.effortLevels).toEqual([])
  expect(card?.defaultEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']) // "Padrão do motor" has its own levels
  expect(cards.find(row => row.id === 'codex')?.models?.[0]).toMatchObject({ id: 'gpt-6-sol', effortLevels: ['low', 'medium', 'high'] })
  expect(cards.find(row => row.id === 'codex')?.source).toBe('cli')
  expect(asked).toBe(1)
  probe.reset()
  await probe.ready()
  expect(asked).toBe(1) // the CLI's own menu is asked once per installed version
})

it('the CLI did not answer: the card uses the static table and SAYS so (source "static"); asked again next pass; no "sonnet" fixed anywhere', async () => {
  let asked = 0
  const probe = new ConnectionProbe({
    detect: () => Promise.resolve([claude()]),
    claudeMenu: () => { asked += 1; return Promise.resolve({ entries: STATIC_CLAUDE_MENU, source: 'static' } satisfies EngineMenu) },
  })
  const [card] = await probe.ready()
  expect(card?.source).toBe('static')
  expect(card?.models?.map(model => model.id)).toEqual(['opus', 'sonnet', 'fable', 'haiku'])
  expect(card?.defaultEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(probe.menuSources()).toEqual({ claude: 'static' })
  probe.reset()
  await probe.ready()
  expect(asked).toBe(2) // a static answer is not remembered: the CLI may answer next time
})

it('an engine that is not installed, or whose detection already carries a menu, is not asked; the built-in engine has no menu', async () => {
  let asked = 0
  const probe = new ConnectionProbe({
    detect: () => Promise.resolve([claude({ installed: false }), codex]),
    claudeMenu: () => { asked += 1; return Promise.resolve({ entries: STATIC_CLAUDE_MENU, source: 'static' } satisfies EngineMenu) },
  })
  const cards = await probe.ready()
  expect(asked).toBe(0)
  expect(cards.find(row => row.id === 'claude')?.models).toBeUndefined()
  expect(cards.find(row => row.id === 'claude')?.source).toBeUndefined()
})
