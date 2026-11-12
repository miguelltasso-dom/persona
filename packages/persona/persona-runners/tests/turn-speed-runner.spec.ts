/**
 * Item 9c (Tally, 11/11), the wiring: the speed the PERSONA asked for reaches the Codex session only through `resolveRunner`'s purpose rule: the live conversation (`talk`)
 * gets the fast tier, a Task gets the explicit standard one, and a persona who never asked has NOTHING added. Fake runtime: no real CLI, no model, no plan spent.
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import { resolveRunner, type PersonaRunnerSpec } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

const FAST = ['-c', 'service_tier="fast"', '-c', 'features.fast_mode=true']
const STANDARD = ['-c', 'features.fast_mode=false']

function capturing(): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'gpt-5' }, { id: 'default' }] }),
    session: async (installation: unknown, options: SessionOptions) => {
      opened.push(options)
      const accepted = { ...options }
      delete (accepted as { effort?: string }).effort
      return openOriginal(installation as never, accepted)
    },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/speed', prompt: 'oi', model: 'gpt-5', permissionMode: 'allow-once' }

async function launchArgsOf(spec: PersonaRunnerSpec, purpose: 'talk' | 'task'): Promise<readonly string[]> {
  const { runtime, opened } = capturing()
  const mode = purpose === 'talk' ? 'deny' : 'allow-once'
  const runner: Runner = await resolveRunner({
    spec, permissionMode: mode, runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/speed', pool: createSessionPool<Runner>(),
    infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, purpose,
  })
  const handle = await runner.start({ ...input, permissionMode: mode })
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  await runner.dispose?.()
  const options = opened[0]
  if (options === undefined) throw new Error('no session was opened')
  return options.launchArgs ?? []
}

describe('fast only on a live conversation (resolveRunner)', () => {
  const asked: PersonaRunnerSpec = { kind: 'cli', cli: 'codex', model: 'gpt-5', talkModel: 'gpt-5', speed: 'fast' }

  it('the live conversation of a persona who asked runs at the fast tier', async () => {
    const args = await launchArgsOf(asked, 'talk')
    expect(args).toEqual(expect.arrayContaining(FAST))
    expect(args.join(' ')).not.toContain('fast_mode=false')
  })

  it('her Task (nobody waiting) runs at the EXPLICIT standard tier, never the fast one', async () => {
    const args = await launchArgsOf(asked, 'task')
    expect(args).toEqual(expect.arrayContaining(STANDARD))
    expect(args.join(' ')).not.toContain('service_tier')
    expect(args.join(' ')).not.toContain('fast_mode=true')
  })

  it('a persona who never asked has NOTHING about the tier in either call (default OFF, zero change)', async () => {
    for (const purpose of ['talk', 'task'] as const) {
      const args = (await launchArgsOf({ kind: 'cli', cli: 'codex', model: 'gpt-5', talkModel: 'gpt-5' }, purpose)).join(' ')
      expect(args).not.toContain('service_tier')
      expect(args).not.toContain('fast_mode')
    }
  })

  it('an engine without the tier is never sent the argument, even when the persona\'s setting says fast', async () => {
    const args = (await launchArgsOf({ kind: 'cli', cli: 'cursor', model: 'gpt-5', talkModel: 'gpt-5', speed: 'fast' }, 'talk')).join(' ')
    expect(args).not.toContain('service_tier')
    expect(args).not.toContain('fast_mode')
  })
})
