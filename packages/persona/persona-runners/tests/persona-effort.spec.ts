/**
 * EFF-1 (D-088): the runner passes the PERSONA's own model and effort. No choice = the engine's default (nothing is sent).
 * The effort belongs to the persona's own model (a task), not to the cheap talk model; a warm session is never handed to a persona
 * that changed it; and the effort the AO-1 isolation would restore never overrides the persona's choice.
 * Fake runtime: no real CLI, no model.
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import { createClaudeRunner } from '../src/oar/claude.ts'
import type { ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { IsolationGate, IsolationRuntime, type GateIo } from '../src/oar/isolation-gate.ts'
import { resolveRunner, type PersonaRunnerSpec } from '../src/resolve/resolve-runner.ts'
import { createSessionPool, sessionPoolKey } from '../src/resolve/session-pool.ts'

const NATIVE = { PERSONA_CLI_ENV: 'native' }
const ANSWER_ONLY = { PERSONA_CLI_ENV: 'answer-only' }

function capturing(via: 'bundled' | 'executable' = 'bundled', acceptEffort = true): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => (via === 'bundled' ? { kind: 'available', via } : { kind: 'available', via, command: 'claude', version: '2.1.318' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'opus' }, { id: 'haiku' }, { id: 'sonnet' }, { id: 'default' }] }),
    session: async (installation: unknown, options: SessionOptions) => {
      opened.push(options)
      // the scripted runtime lists no effort menu and so REFUSES any effort; `acceptEffort` plays an engine that accepts it
      if (acceptEffort) { const accepted = { ...options }; delete (accepted as { effort?: string }).effort; return openOriginal(installation as never, accepted) }
      return openOriginal(installation as never, options)
    },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/eff', prompt: 'oi', model: 'opus', permissionMode: 'allow-once' }

async function openWith(spec: PersonaRunnerSpec, over: { purpose?: 'talk' | 'task'; permissionMode?: 'deny' | 'allow-once'; env?: NodeJS.ProcessEnv; isolation?: IsolationRuntime; via?: 'bundled' | 'executable' } = {}): Promise<{ options: SessionOptions; runner: Runner }> {
  const { runtime, opened } = capturing(over.via)
  const mode = over.permissionMode ?? 'allow-once'
  const runner = await resolveRunner({
    spec, permissionMode: mode, runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/eff', pool: createSessionPool<Runner>(),
    infra: { wait: async () => undefined }, env: over.env ?? NATIVE, ...(over.purpose === undefined ? {} : { purpose: over.purpose }),
    ...(over.isolation === undefined ? {} : { isolation: over.isolation }),
  })
  const handle = await runner.start({ ...input, model: spec.kind === 'cli' ? spec.model : 'default', permissionMode: mode })
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session was opened')
  return { options, runner }
}

describe('the runner passes the persona\'s own model and effort', () => {
  it('a task carries the persona\'s model AND effort to the CLI', async () => {
    const { options, runner } = await openWith({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'xhigh' })
    expect(options.model).toBe('opus')
    expect((options as { effort?: string }).effort).toBe('xhigh')
    await runner.dispose?.()
  })

  it('no choice = the engine\'s default: no model flag and no effort flag are sent', async () => {
    const { options, runner } = await openWith({ kind: 'cli', cli: 'claude', model: 'default' })
    expect(options.model).toBeUndefined()
    expect('effort' in options).toBe(false)
    await runner.dispose?.()
  })

  it('a model without an effort choice sends the model only', async () => {
    const { options, runner } = await openWith({ kind: 'cli', cli: 'claude', model: 'sonnet' })
    expect(options.model).toBe('sonnet')
    expect('effort' in options).toBe(false)
    await runner.dispose?.()
  })

  it('the cheap talk model does NOT inherit the persona\'s effort (it is the persona\'s own model\'s)', async () => {
    const { options, runner } = await openWith({ kind: 'cli', cli: 'claude', model: 'opus', talkModel: 'haiku', effort: 'xhigh' }, { purpose: 'talk', permissionMode: 'deny' })
    expect(options.model).toBe('haiku')
    expect('effort' in options).toBe(false)
    await runner.dispose?.()
  })

  it('Codex takes the persona\'s effort too (EFF-1 ships ON, Atlas 05/11: OAR sets model_reasoning_effort from the same option); a CLI with no effort option is never sent one', async () => {
    const codex = await openWith({ kind: 'cli', cli: 'codex', model: 'default', effort: 'high' })
    expect((codex.options as { effort?: string }).effort).toBe('high')
    await codex.runner.dispose?.()
    const opencode = await openWith({ kind: 'cli', cli: 'opencode', model: 'default', effort: 'high' })
    expect('effort' in opencode.options).toBe(false)
    await opencode.runner.dispose?.()
  })
})

describe('an engine that REFUSES the effort (a model without an effort menu) does not fail the persona\'s call', () => {
  it('the session reopens without the effort and the usage says which effort was dropped', async () => {
    const { runtime, opened } = capturing('bundled', false)
    const runner = createClaudeRunner({ runtime })
    const handle = await runner.start({ ...input, model: 'haiku', effort: 'xhigh' })
    for await (const event of runner.stream(handle)) if (event.type === 'ended') break
    expect(opened).toHaveLength(2)
    expect((opened[0] as { effort?: string }).effort).toBe('xhigh')
    expect('effort' in (opened[1] as object)).toBe(false)
    expect(await runner.usage(handle)).toMatchObject({ effortDropped: 'xhigh' })
    await runner.dispose?.()
  })

  it('an error that is not about the effort is not swallowed', async () => {
    const failing = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
    const runtime = Object.assign(failing, { session: async () => { throw new Error('boom: cannot start') } }) as unknown as Runtime
    const runner = createClaudeRunner({ runtime })
    await expect(runner.start({ ...input, effort: 'high' })).rejects.toThrow(/boom/u)
  })
})

describe('a warm session is never handed to a persona that changed the effort', () => {
  it('same effort reuses the session; a different effort opens a new one', async () => {
    const { runtime, opened } = capturing()
    const runner = createClaudeRunner({ runtime })
    const turn = async (effort?: string): Promise<void> => {
      const handle = await runner.start({ ...input, ...(effort === undefined ? {} : { effort }) })
      for await (const event of runner.stream(handle)) if (event.type === 'ended') break
    }
    await turn('high')
    await turn('high')
    expect(opened).toHaveLength(1)
    await turn('low')
    expect(opened).toHaveLength(2)
    expect((opened[1] as { effort?: string }).effort).toBe('low')
    await runner.dispose?.()
  })

  it('the pool key tells efforts apart, and is unchanged when there is none (old keys keep working)', () => {
    const base = { personaId: 'nina', projectId: 'p1', purpose: 'task' as const, provider: 'claude', model: 'opus', cwd: 'C:/x', permissionMode: 'allow-once', toolLevel: 'write' }
    expect(sessionPoolKey({ ...base, effort: 'high' })).not.toBe(sessionPoolKey({ ...base, effort: 'low' }))
    expect(sessionPoolKey({ ...base, effort: 'high' })).not.toBe(sessionPoolKey(base))
    expect(sessionPoolKey(base)).toBe('nina|p1|task|claude|opus|C:/x|allow-once|write|')
  })
})

// ---- AO-1 parity must never override the persona's choice ------------------------------------------------------------

function memoryIo(): GateIo {
  let text: string | undefined
  return { read: () => text, write: (next) => { text = next } }
}

/** Behaves like the CLI measured on 2.1.318: the person's own effort is xhigh, and project-only sources drop it to medium. */
const fakeOpen: OpenControl = (launch): ControlSession => {
  const after = (flag: string): string | undefined => { const at = launch.args.indexOf(flag); return at >= 0 ? launch.args[at + 1] : undefined }
  const projectOnly = launch.args.includes('--setting-sources')
  const model = after('--model') ?? 'claude-opus-5-5'
  const effort = after('--effort') ?? (projectOnly ? 'medium' : 'xhigh')
  return {
    request: async (subtype) => {
      if (subtype === 'initialize') return { account: { subscriptionType: 'x' }, commands: launch.args.includes('--disable-slash-commands') ? [] : ['a'] }
      if (subtype === 'mcp_status') return { mcpServers: launch.args.includes('--strict-mcp-config') ? [] : [{ status: 'connected' }] }
      if (subtype === 'get_context_usage') return { totalTokens: 1608, categories: [{ name: 'System tools', tokens: launch.args.includes('--tools') ? 0 : 1 }] }
      if (subtype === 'get_settings') return { applied: { model, effort } }
      return {}
    },
    close: async () => undefined,
  }
}

describe('with the AO-1 isolation on, the persona\'s effort wins over the one the isolation restores', () => {
  it('no persona choice: the isolation restores the person\'s own effort (xhigh); with a persona choice, ONLY the persona\'s reaches the CLI', async () => {
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen, fingerprint: () => 'fp', timing: { arriveMs: 20, pauseMs: 1 } })
    // prove version + parity for a `default` persona and for an explicit-model persona
    await isolation.warm({ version: '2.1.318', mode: 'answer-only', modelArg: 'default', env: ANSWER_ONLY })
    await isolation.warm({ version: '2.1.318', mode: 'answer-only', modelArg: 'opus', env: ANSWER_ONLY })

    const restored = await openWith({ kind: 'cli', cli: 'claude', model: 'opus' }, { permissionMode: 'deny', env: ANSWER_ONLY, isolation, via: 'executable' })
    expect(restored.options.launchArgs).toEqual(expect.arrayContaining(['--effort', 'xhigh']))
    await restored.runner.dispose?.()

    const chosen = await openWith({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'low' }, { permissionMode: 'deny', env: ANSWER_ONLY, isolation, via: 'executable' })
    expect(chosen.options.launchArgs ?? []).not.toContain('--effort')
    expect((chosen.options as { effort?: string }).effort).toBe('low')
    await chosen.runner.dispose?.()
  })
})
