/**
 * EFF-1 (Atlas 05/11: it ships ON) at the RUNNER, end to end through `resolveRunner`: the model and the reasoning effort the person chose for a persona reach the CLI (Claude: `--model` /
 * `--effort`; Codex: its `model_reasoning_effort`), "padrão do motor" sends NOTHING, a chosen model the engine does not offer never drops the Task (it runs on the engine's default and the usage
 * says so), and the choice is said next to the tokens so the ledger can show "this turn ran on Opus at max". Also the D-097 interim: our small tool set stays inline (no tool search) when the session
 * has no connector. Fake runtimes: no real CLI, no model (the real-CLI proof is `scripts/eff1-dry.ts`).
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import { effortLevelsFor, STATIC_EFFORT_LEVELS } from '../src/oar/effort-table.ts'
import { IsolationGate, IsolationRuntime, type GateIo } from '../src/oar/isolation-gate.ts'
import { resetProbeCache } from '../src/index.ts'
import { resolveRunner, TOOL_SEARCH_OURS_INLINE, type PersonaRunnerSpec } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'
import { URL_A, fakeOpen, unreachedWorld } from './support/unreached-world.ts'

const NATIVE = { PERSONA_CLI_ENV: 'native' }
const NEEDED = { PERSONA_CLI_ENV: 'needed' }

function capturing(models: readonly string[] = ['opus', 'haiku', 'sonnet', 'default'], via: 'bundled' | 'executable' = 'bundled'): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => (via === 'bundled' ? { kind: 'available', via } : { kind: 'available', via, command: 'claude', version: '2.1.318' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: models.map(id => ({ id })) }),
    session: async (installation: unknown, options: SessionOptions) => {
      opened.push(options)
      const accepted = { ...options }
      delete (accepted as { effort?: string }).effort // the scripted runtime lists no effort menu and would refuse it
      return openOriginal(installation as never, accepted)
    },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

type Usage = Awaited<ReturnType<Runner['usage']>>

async function run(
  spec: PersonaRunnerSpec,
  over: { models?: readonly string[]; env?: NodeJS.ProcessEnv; via?: 'bundled' | 'executable'; isolation?: IsolationRuntime; accountConnectors?: readonly string[]; pool?: ReturnType<typeof createSessionPool<Runner>> } = {},
): Promise<{ options: SessionOptions; usage: Usage; pool: ReturnType<typeof createSessionPool<Runner>> }> {
  resetProbeCache()
  const { runtime, opened } = capturing(over.models, over.via)
  const pool = over.pool ?? createSessionPool<Runner>()
  const runner = await resolveRunner({
    spec, permissionMode: 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/eff', pool, infra: { wait: async () => undefined },
    env: over.env ?? NATIVE, ...(over.isolation === undefined ? {} : { isolation: over.isolation }), ...(over.accountConnectors === undefined ? {} : { accountConnectors: over.accountConnectors }),
  })
  const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/eff', prompt: 'oi', model: spec.kind === 'cli' ? spec.model : 'default', permissionMode: 'allow-once' }
  const handle = await runner.start(input)
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session was opened')
  const usage = await runner.usage(handle)
  await runner.dispose?.()
  return { options, usage, pool }
}

describe('the person\'s choice reaches the CLI and is said next to the tokens', () => {
  it('Claude: Opus at max => the session opens with model "opus" and effort "max" (the CLI\'s --model/--effort), and the usage says what was chosen', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'max' })
    expect(options.model).toBe('opus')
    expect((options as { effort?: string }).effort).toBe('max')
    expect(usage).toMatchObject({ modelRequested: 'opus', effortRequested: 'max' })
    expect(usage.modelDropped).toBeUndefined()
  })

  it('Codex: the effort reaches the engine too (OAR sets model_reasoning_effort from the same option), with the model', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'codex', model: 'gpt-6-luna', effort: 'ultra' }, { models: ['gpt-6-luna', 'default'] })
    expect(options.model).toBe('gpt-6-luna')
    expect((options as { effort?: string }).effort).toBe('ultra')
    expect(usage).toMatchObject({ modelRequested: 'gpt-6-luna', effortRequested: 'ultra' })
  })

  it('"Padrão do motor" (no model, no effort) sends NOTHING and says nothing: the engine\'s defaults, no invented choice', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'claude', model: 'default' })
    expect(options.model).toBeUndefined()
    expect((options as { effort?: string }).effort).toBeUndefined()
    expect('modelRequested' in usage).toBe(false)
    expect('effortRequested' in usage).toBe(false)
    expect('modelDropped' in usage).toBe(false)
    // an effort spelled "default" or empty is also no choice
    const spelled = await run({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'default' })
    expect((spelled.options as { effort?: string }).effort).toBeUndefined()
    expect('effortRequested' in spelled.usage).toBe(false)
    expect(spelled.usage.modelRequested).toBe('opus')
  })

  it('a model alone (no effort) sends only the model', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'claude', model: 'sonnet' })
    expect(options.model).toBe('sonnet')
    expect((options as { effort?: string }).effort).toBeUndefined()
    expect(usage).toMatchObject({ modelRequested: 'sonnet' })
    expect('effortRequested' in usage).toBe(false)
  })
})

describe('a chosen model the engine does not offer never drops the Task', () => {
  it('it runs on the engine\'s default (no --model), the effort still goes, and the usage says which model was dropped', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'claude', model: 'opus-5-7-retired', effort: 'high' }, { models: ['haiku', 'sonnet', 'default'] })
    expect(options.model).toBeUndefined()
    expect((options as { effort?: string }).effort).toBe('high')
    expect(usage).toMatchObject({ modelRequested: 'opus-5-7-retired', modelDropped: 'opus-5-7-retired', effortRequested: 'high' })
  })

  it('the fallback runner is that call\'s alone: it never enters the pool, so the next call is decided again', async () => {
    const pool = createSessionPool<Runner>()
    const first = await run({ kind: 'cli', cli: 'claude', model: 'opus-5-7-retired' }, { models: ['haiku', 'default'], pool })
    expect(first.usage.modelDropped).toBe('opus-5-7-retired')
    // the account now offers it: the next call runs on it
    const second = await run({ kind: 'cli', cli: 'claude', model: 'opus-5-7-retired' }, { models: ['opus-5-7-retired', 'default'], pool })
    expect(second.options.model).toBe('opus-5-7-retired')
    expect('modelDropped' in second.usage).toBe(false)
  })

  it('an engine that lists no models (it did not answer) is not an excuse to drop: the chosen model goes as is', async () => {
    const { options, usage } = await run({ kind: 'cli', cli: 'claude', model: 'opus' }, { models: [] })
    expect(options.model).toBe('opus')
    expect('modelDropped' in usage).toBe(false)
  })
})

describe('the static table of levels, for when the engine does not answer', () => {
  it('Claude and Codex have a table; the engine\'s own menu always wins; any other CLI has no effort choice', () => {
    expect(STATIC_EFFORT_LEVELS.claude).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(STATIC_EFFORT_LEVELS.codex).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    expect(effortLevelsFor('claude')).toEqual({ levels: STATIC_EFFORT_LEVELS.claude, origin: 'static' })
    expect(effortLevelsFor('codex', undefined)).toEqual({ levels: STATIC_EFFORT_LEVELS.codex, origin: 'static' })
    expect(effortLevelsFor('codex', ['low', 'high'])).toEqual({ levels: ['low', 'high'], origin: 'engine' })
    expect(effortLevelsFor('codex', [])).toEqual({ levels: STATIC_EFFORT_LEVELS.codex, origin: 'static' })
    expect(effortLevelsFor('opencode')).toBeUndefined()
    expect(effortLevelsFor('cursor', ['x'])).toEqual({ levels: ['x'], origin: 'engine' })
  })
})

describe('D-097 interim: our small tool set stays inline when the session has no connector', () => {
  const provenRuntime = async (state = unreachedWorld()): Promise<IsolationRuntime> => {
    let text: string | undefined
    const io: GateIo = { read: () => text, write: (next) => { text = next } }
    const isolation = new IsolationRuntime({ gate: new IsolationGate(io), open: fakeOpen(state), fingerprint: () => 'fp', timing: { arriveMs: 30, pauseMs: 1 } })
    await isolation.warm({ version: '2.1.318', mode: 'needed', modelArg: 'haiku', env: NEEDED })
    return isolation
  }
  const envOf = (options: SessionOptions): Record<string, string | null> => (options.env ?? {}) as Record<string, string | null>

  it('needed + no connector => ENABLE_TOOL_SEARCH is set to auto:5 for the CLI', async () => {
    const { options } = await run({ kind: 'cli', cli: 'claude', model: 'haiku' }, { env: NEEDED, via: 'executable', isolation: await provenRuntime() })
    expect(TOOL_SEARCH_OURS_INLINE).toBe('auto:5')
    expect(envOf(options).ENABLE_TOOL_SEARCH).toBe('auto:5')
  })

  it('with a connector granted nothing changes: the variable is NOT set (the sum with a connector is not proven)', async () => {
    const { options } = await run({ kind: 'cli', cli: 'claude', model: 'haiku' }, { env: NEEDED, via: 'executable', isolation: await provenRuntime(), accountConnectors: [URL_A] })
    expect('ENABLE_TOOL_SEARCH' in envOf(options)).toBe(false)
  })

  it('native mode (everything of the person loaded) and other CLIs: the variable is NOT set', async () => {
    const native = await run({ kind: 'cli', cli: 'claude', model: 'haiku' }, { env: NATIVE })
    expect('ENABLE_TOOL_SEARCH' in envOf(native.options)).toBe(false)
    const codex = await run({ kind: 'cli', cli: 'codex', model: 'default' }, { env: NEEDED, models: ['default'] })
    expect('ENABLE_TOOL_SEARCH' in envOf(codex.options)).toBe(false)
  })
})
