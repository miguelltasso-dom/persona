/**
 * EFF-1 (D-088): the screen builds its model and effort menu from what the ENGINE says, not from a hard-coded "sonnet".
 * `detectConnections` carries, next to the model ids, each model's name and the reasoning-effort levels the engine accepts for it.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import { detectConnections } from '../src/index.ts'
import type { ModelMenuEntry } from '../src/resolve/connections.ts'

function engine(models: readonly Record<string, unknown>[]) {
  return Object.assign(scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } }), {
    installation: async () => ({ kind: 'available', via: 'bundled' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models }),
  })
}

async function claudeCard(models: readonly Record<string, unknown>[]) {
  const runtime = engine(models)
  const cards = await detectConnections({ timeoutMs: 2_000, force: true, runtimes: { claude: runtime, codex: runtime, opencode: runtime, cursor: runtime } })
  const card = cards.find(row => row.id === 'claude')
  if (card === undefined) throw new Error('no claude card')
  return card
}

describe('the model menu comes from the engine', () => {
  it('carries each model\'s name and the effort levels THAT model accepts (older models have fewer)', async () => {
    const card = await claudeCard([
      { id: 'default', displayName: 'Default', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { id: 'claude-opus-4-6', displayName: 'Opus 4.6', effortLevels: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
      { id: 'claude-haiku-4-5-20251001' },
    ])
    const menu = card.modelMenu as readonly ModelMenuEntry[]
    expect(card.models).toEqual(['default', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'])
    expect(menu[0]).toEqual({ id: 'default', label: 'Default', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] })
    expect(menu[1]).toEqual({ id: 'claude-opus-4-6', label: 'Opus 4.6', efforts: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' })
    // a model with no effort menu has NO `efforts` key: the screen offers no effort choice for it (never an invented list)
    expect(menu[2]).toEqual({ id: 'claude-haiku-4-5-20251001' })
    expect('efforts' in (menu[2] as object)).toBe(false)
  })

  it('marks a model the engine lists but refuses to run', async () => {
    const card = await claudeCard([{ id: 'old', displayName: 'Old', disabled: { reason: 'retired' } }])
    expect(card.modelMenu).toEqual([{ id: 'old', label: 'Old', disabled: true }])
  })

  it('an engine that says nothing beyond ids adds no menu (the ids stay as they were)', async () => {
    const card = await claudeCard([{ id: 'a' }, { id: 'b' }])
    expect(card.models).toEqual(['a', 'b'])
    expect(card.modelMenu).toBeUndefined()
  })

  it('never leaks the engine\'s reason text: only a flag', async () => {
    const card = await claudeCard([{ id: 'x', displayName: 'X', disabled: { reason: 'secret internal reason' } }])
    expect(JSON.stringify(card.modelMenu)).not.toContain('secret internal reason')
  })
})
