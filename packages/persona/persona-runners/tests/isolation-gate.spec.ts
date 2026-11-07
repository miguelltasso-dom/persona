/**
 * D-085: a mode is applied to a call only when PROVEN for this CLI version; the person's model and effort stay unchanged; the mode
 * of each call is annotated. A fake control client reproduces what the real CLI was MEASURED to do (reports/iso-dry-claude.json,
 * reports/iso-dry-product.json): no real CLI, no model.
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import type { ControlLaunch, ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { CLAUDE_ISOLATION_ARGS, CLAUDE_ISOLATION_ENV } from '../src/oar/isolation.ts'
import { IsolationGate, IsolationRuntime, parityKey, type GateIo } from '../src/oar/isolation-gate.ts'
import { probeParity, runIsolationProbe } from '../src/oar/isolation-run.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

const ANSWER_ONLY = { PERSONA_CLI_ENV: 'answer-only' }
const NEEDED = { PERSONA_CLI_ENV: 'needed' }

function memoryIo(): GateIo & { text(): string | undefined } {
  let text: string | undefined
  return { read: () => text, write: (next) => { text = next }, text: () => text }
}

interface FakeWorld {
  loggedIn: boolean
  /** The person's own default (user settings) and per-model effort, lost under `--setting-sources project`. */
  settingsModel: string
  settingsEffort: string
  /** What the CLI applies when nobody says anything (this plan's default). */
  cliDefaultModel: string
  cliDefaultEffort: string
  /** When true the isolation flags stop working (a CLI update changed behaviour). */
  isolationBroken: boolean
  launches: ControlLaunch[]
}

function world(over: Partial<FakeWorld> = {}): FakeWorld {
  return {
    loggedIn: true, settingsModel: 'claude-opus-5-5', settingsEffort: 'xhigh', cliDefaultModel: 'claude-opus-5-5', cliDefaultEffort: 'medium',
    isolationBroken: false, launches: [], ...over,
  }
}

/** Behaves like the CLI measured on 2.1.318: strict drops MCP, project-only sources drop the user's model and effort. */
function fakeOpen(state: FakeWorld): OpenControl {
  return (launch): ControlSession => {
    state.launches.push(launch)
    const args = launch.args
    const after = (flag: string): string | undefined => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined }
    const strict = args.includes('--strict-mcp-config') && !state.isolationBroken
    const noCommands = args.includes('--disable-slash-commands') && !state.isolationBroken
    const projectOnly = args.includes('--setting-sources') && !state.isolationBroken
    const noTools = args.includes('--tools')
    const model = after('--model') ?? (projectOnly ? state.cliDefaultModel : state.settingsModel)
    const effort = after('--effort') ?? (projectOnly ? state.cliDefaultEffort : state.settingsEffort)
    return {
      request: async (subtype) => {
        if (subtype === 'initialize') return { account: state.loggedIn ? { subscriptionType: 'x' } : null, commands: noCommands ? [] : ['a', 'b', 'c'] }
        if (subtype === 'mcp_status') return { mcpServers: strict ? [] : [{ status: 'connected' }, { status: 'needs-auth' }] }
        if (subtype === 'get_context_usage') {
          return { totalTokens: strict ? 1608 : 377_321, categories: [{ name: 'System tools', tokens: noTools ? 0 : 29_665 }] }
        }
        if (subtype === 'get_settings') return { applied: { model, effort } }
        return {}
      },
      close: async () => undefined,
    }
  }
}

const fast = { arriveMs: 30, pauseMs: 1 }

describe('runIsolationProbe: the verdict over what the isolated launch came up with', () => {
  it('ok when isolated, logged in, no MCP, no commands, and no built-in tool in a no-tools call', async () => {
    const run = await runIsolationProbe(fakeOpen(world()), { mode: 'needed', calls: ['answer', 'task'], cwd: '.', ...fast })
    expect(run.ok).toBe(true)
    expect(run.rows.map(row => row.openingContextTokens)).toEqual([1608, 1608])
    expect(run.rows[0]?.reading).toMatchObject({ loggedIn: true, mcpServers: 0, commands: 0, builtinToolTokens: 0 })
  })

  it('FAILS when the CLI stops honouring the flags (a version changed behaviour) and says what leaked', async () => {
    const run = await runIsolationProbe(fakeOpen(world({ isolationBroken: true })), { mode: 'answer-only', calls: ['answer'], cwd: '.', ...fast })
    expect(run.ok).toBe(false)
    expect(run.rows[0]?.failures).toEqual(['mcp-servers:2!=0', 'commands-visible:3'])
  })

  it('FAILS when the isolation broke the login', async () => {
    const run = await runIsolationProbe(fakeOpen(world({ loggedIn: false })), { mode: 'answer-only', calls: ['answer'], cwd: '.', ...fast })
    expect(run.ok).toBe(false)
    expect(run.rows[0]?.failures).toContain('not-logged-in')
  })
})

describe('probeParity: zero change of model AND effort (D-085)', () => {
  it('a `default` persona: passes the person\'s own default model and effort explicitly, and the isolated launch then applies the SAME', async () => {
    const parity = await probeParity(fakeOpen(world()), { modelArg: 'default', cwd: '.' })
    expect(parity.native).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
    // isolated without anything applies the CLI default effort (medium): that silent drop is exactly what the explicit flag prevents
    expect(parity.extraArgs).toEqual(['--model', 'claude-opus-5-5', '--effort', 'xhigh'])
    expect(parity.isolated).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
    expect(parity.ok).toBe(true)
  })

  it('the person\'s default is NOT the CLI default: the explicit model is what keeps the model unchanged', async () => {
    const parity = await probeParity(fakeOpen(world({ settingsModel: 'claude-sonnet-5-5', cliDefaultModel: 'claude-opus-5-5' })), { modelArg: 'default', cwd: '.' })
    expect(parity.extraArgs).toContain('claude-sonnet-5-5')
    expect(parity.isolated.model).toBe('claude-sonnet-5-5')
    expect(parity.ok).toBe(true)
  })

  it('an explicit model keeps its model; only an effort that would silently change is added', async () => {
    const same = await probeParity(fakeOpen(world({ settingsEffort: 'medium' })), { modelArg: 'haiku', cwd: '.' })
    expect(same.extraArgs).toEqual([])
    expect(same.ok).toBe(true)
    const drops = await probeParity(fakeOpen(world()), { modelArg: 'haiku', cwd: '.' })
    expect(drops.extraArgs).toEqual(['--effort', 'xhigh'])
    expect(drops.ok).toBe(true)
  })

  it('FAILS (keeps native) when the isolated launch cannot be made to apply the native model/effort', async () => {
    const stubborn: OpenControl = (launch) => {
      const base = fakeOpen(world())(launch)
      return { ...base, request: async (subtype, params) => (subtype === 'get_settings' && launch.args.includes('--setting-sources') ? { applied: { model: 'other', effort: 'low' } } : base.request(subtype, params)) }
    }
    const parity = await probeParity(stubborn, { modelArg: 'default', cwd: '.' })
    expect(parity.ok).toBe(false)
  })
})

describe('IsolationRuntime.decide: the requested mode runs only when proven for this CLI version (fail-safe native)', () => {
  const base = { cli: 'claude', call: 'answer' as const, modelArg: 'default', version: '2.1.318', env: ANSWER_ONLY }
  const runtimeOf = (state: FakeWorld, io = memoryIo()) => new IsolationRuntime({ gate: new IsolationGate(io), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast })

  it('unproven version: THIS call runs native (the chat never waits for a probe); the next one runs isolated, with the parity arguments', async () => {
    const runtime = runtimeOf(world())
    const first = runtime.decide(base)
    expect(first).toMatchObject({ requestedMode: 'answer-only', effectiveMode: 'native', reason: 'unverified' })
    expect(first.plan.launchArgs).toEqual([])
    await runtime.idle()
    const second = runtime.decide(base)
    expect(second).toMatchObject({ requestedMode: 'answer-only', effectiveMode: 'answer-only', reason: 'verified' })
    expect(second.plan.launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(second.plan.env).toEqual(CLAUDE_ISOLATION_ENV)
    expect(second.extraArgs).toEqual(['--model', 'claude-opus-5-5', '--effort', 'xhigh'])
  })

  it('a failed proof (the CLI changed behaviour) keeps the version native and is remembered', async () => {
    const runtime = runtimeOf(world({ isolationBroken: true }))
    runtime.decide(base)
    await runtime.idle()
    expect(runtime.decide(base)).toMatchObject({ effectiveMode: 'native', reason: 'failed-version', requestedMode: 'answer-only' })
  })

  it('a logged-out account is not a verdict on the version: nothing is recorded, and it is retried only after the back-off', async () => {
    const state = world({ loggedIn: false })
    let clock = 1_000_000
    const errors: string[] = []
    const runtime = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast, now: () => clock, retryAfterMs: 60_000, onError: message => errors.push(message) })
    runtime.decide(base)
    await runtime.idle()
    expect(errors).toEqual(['isolation probe: account not logged in'])
    expect(runtime.decide(base)).toMatchObject({ effectiveMode: 'native', reason: 'unverified' }) // not 'failed-version'
    await runtime.idle()
    const launchesAfterFirst = state.launches.length
    clock += 30_000
    runtime.decide(base)
    await runtime.idle()
    expect(state.launches.length).toBe(launchesAfterFirst) // inside the back-off: no new probe
    clock += 60_000
    state.loggedIn = true
    runtime.decide(base)
    await runtime.idle()
    expect(runtime.decide(base)).toMatchObject({ effectiveMode: 'answer-only', reason: 'verified' })
  })

  it('a NEW version is proven again: the old proof does not carry over', async () => {
    const runtime = runtimeOf(world())
    runtime.decide(base)
    await runtime.idle()
    expect(runtime.decide(base).effectiveMode).toBe('answer-only')
    expect(runtime.decide({ ...base, version: '2.1.400' })).toMatchObject({ effectiveMode: 'native', reason: 'unverified' })
  })

  it('an unknown version is never proven', () => {
    expect(runtimeOf(world()).decide({ ...base, version: undefined })).toMatchObject({ effectiveMode: 'native', reason: 'unverified' })
  })

  it('the person editing their settings (fingerprint) re-proves parity before the isolated launch is used again', async () => {
    let fingerprint = 'fp1'
    const state = world()
    const runtime = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => fingerprint, timing: fast })
    runtime.decide(base)
    await runtime.idle()
    expect(runtime.decide(base).effectiveMode).toBe('answer-only')
    fingerprint = 'fp2'
    state.settingsEffort = 'high'
    expect(runtime.decide(base)).toMatchObject({ effectiveMode: 'native', reason: 'parity-unproven' })
    await runtime.idle()
    expect(runtime.decide(base).extraArgs).toEqual(['--model', 'claude-opus-5-5', '--effort', 'high'])
  })

  it('the default is needed (D-096): an unset switch behaves like it (first call native, verified in the background)', () => {
    const runtime = runtimeOf(world())
    expect(runtime.decide({ ...base, env: {} })).toMatchObject({ requestedMode: 'needed', effectiveMode: 'native', reason: 'unverified' })
  })

  it('native mode and calls the plan does not change never probe anything', () => {
    const state = world()
    const runtime = runtimeOf(state)
    expect(runtime.decide({ ...base, env: { PERSONA_CLI_ENV: 'native' } })).toMatchObject({ effectiveMode: 'native', reason: 'off' })
    expect(runtime.decide({ ...base, cli: 'codex', env: NEEDED })).toMatchObject({ effectiveMode: 'native', reason: 'not-applicable' })
    // answer-only leaves a call WITH tools exactly as it was
    expect(runtime.decide({ ...base, call: 'task' })).toMatchObject({ effectiveMode: 'native', reason: 'not-applicable' })
    expect(state.launches).toEqual([])
  })

  it('a CLI that has no probe yet (OpenCode in the end state) stays native until it has one', () => {
    expect(runtimeOf(world()).decide({ ...base, cli: 'opencode', env: NEEDED })).toMatchObject({ effectiveMode: 'native', reason: 'unverified' })
  })

  it('a proof for `needed` also covers `answer-only`', async () => {
    const runtime = runtimeOf(world())
    await runtime.warm({ version: '2.1.318', mode: 'needed', modelArg: 'default', env: NEEDED })
    expect(runtime.decide(base).effectiveMode).toBe('answer-only')
  })

  it('the gate stores verdicts and argument strings only: no connector name, no account', async () => {
    const io = memoryIo()
    const runtime = runtimeOf(world(), io)
    runtime.decide(base)
    await runtime.idle()
    const text = io.text() ?? ''
    expect(text).toContain('2.1.318|answer-only')
    expect(text).not.toMatch(/subscriptionType|account|@/u)
  })

  it('a corrupt gate file proves nothing (fail-safe): the call runs native', () => {
    const io: GateIo = { read: () => '{not json', write: () => undefined }
    const runtime = new IsolationRuntime({ gate: new IsolationGate(io), open: fakeOpen(world()), fingerprint: () => 'fp1', timing: fast })
    expect(runtime.decide(base)).toMatchObject({ effectiveMode: 'native', reason: 'unverified' })
  })

  it('parityKey separates version, model and settings state', () => {
    expect(parityKey('v', 'default', 'a')).not.toBe(parityKey('v', 'default', 'b'))
    expect(parityKey('v', 'haiku', 'a')).not.toBe(parityKey('v', 'default', 'a'))
    expect(parityKey('v', '', 'a')).toBe(parityKey('v', 'default', 'a'))
  })
})

// ---- through resolveRunner with a real-looking (executable) installation ---------------------------------------------

const input: StartTurnInput = {
  ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/gate', prompt: 'oi', model: 'default', permissionMode: 'deny',
}

function executableRuntime(version = '2.1.318 (Claude Code)'): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'executable', command: 'claude', version }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'default' }] }),
    session: async (installation: unknown, options: SessionOptions) => { opened.push(options); return openOriginal(installation as never, options) },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

async function runOnce(runtime: Runtime, isolation: IsolationRuntime, env: NodeJS.ProcessEnv): Promise<{ runner: Runner; usage: Awaited<ReturnType<Runner['usage']>> }> {
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'default' }, permissionMode: 'deny', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/gate',
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env, isolation,
  })
  const handle = await runner.start(input)
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  return { runner, usage: await runner.usage(handle) }
}

describe('resolveRunner + gate: what the session really opens with, and what the ledger is told', () => {
  it('FRESH INSTALL: the very first call is already isolated (it waits, bounded, for the proof), with the person\'s model and effort passed explicitly, and the next call proves nothing again', async () => {
    const state = world()
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast })
    const first = executableRuntime()
    const one = await runOnce(first.runtime, isolation, ANSWER_ONLY)
    // the argv the CLI is really started with, on the FIRST call of a version nobody had proven
    const args = first.opened[0]?.launchArgs ?? []
    expect(args).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS, '--model', 'claude-opus-5-5', '--effort', 'xhigh']))
    expect(first.opened[0]?.env).toMatchObject(CLAUDE_ISOLATION_ENV)
    expect(one.usage).toMatchObject({ envMode: 'answer-only', envModeReason: 'verified' })
    expect(one.usage.envModeRequested).toBeUndefined()
    await one.runner.dispose?.()
    const proofLaunches = state.launches.length
    expect(proofLaunches).toBeGreaterThan(0)

    const second = executableRuntime()
    const two = await runOnce(second.runtime, isolation, ANSWER_ONLY)
    expect(second.opened[0]?.launchArgs ?? []).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(two.usage).toMatchObject({ envMode: 'answer-only', envModeReason: 'verified' })
    // the proof is once per CLI version and model: the second call opened no control session
    expect(state.launches).toHaveLength(proofLaunches)
    await two.runner.dispose?.()
  })

  it('a CLI update that changes behaviour sends the next calls back to native, and the usage says so', async () => {
    const state = world({ isolationBroken: true })
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast })
    await runOnce(executableRuntime().runtime, isolation, ANSWER_ONLY)
    await isolation.idle()
    const later = executableRuntime()
    const result = await runOnce(later.runtime, isolation, ANSWER_ONLY)
    expect(later.opened[0]?.launchArgs ?? []).not.toContain('--strict-mcp-config')
    expect(result.usage).toMatchObject({ envMode: 'native', envModeRequested: 'answer-only', envModeReason: 'failed-version' })
  })

  it('the probe only ever sends CONTROL requests: no user message, so it can never reach a model', async () => {
    const state = world()
    const subtypes = new Set<string>()
    const spying: OpenControl = (launch) => {
      const inner = fakeOpen(state)(launch)
      return { ...inner, request: async (subtype, params) => { subtypes.add(subtype); return inner.request(subtype, params) } }
    }
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: spying, fingerprint: () => 'fp1', timing: fast })
    await isolation.warm({ version: '2.1.318', mode: 'answer-only', modelArg: 'default', env: ANSWER_ONLY })
    expect([...subtypes].sort()).toEqual(['get_context_usage', 'get_settings', 'initialize', 'mcp_status'])
  })

  it('a probe that NEVER answers cannot hold or fail the turn beyond the bounded wait: it runs native and the turn ends', async () => {
    const hanging: OpenControl = () => ({ request: () => new Promise<Record<string, unknown>>(() => undefined), close: async () => undefined })
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: hanging, fingerprint: () => 'fp1', timing: fast, settleMs: 60 })
    const { runtime, opened } = executableRuntime()
    const result = await runOnce(runtime, isolation, ANSWER_ONLY)
    expect(opened[0]?.launchArgs ?? []).not.toContain('--strict-mcp-config')
    expect(result.usage).toMatchObject({ envMode: 'native', envModeRequested: 'answer-only', envModeReason: 'unverified' })
    await result.runner.dispose?.()
  })

  it('a SLOW proof (slower than the wait) does not delay the turn past the wait: that call runs native, the proof finishes in the background and the NEXT call is isolated', async () => {
    const state = world()
    const slow: OpenControl = (launch) => {
      const inner = fakeOpen(state)(launch)
      return { ...inner, request: async (subtype, params) => { await new Promise<void>((resolve) => { setTimeout(resolve, 25) }); return inner.request(subtype, params) } }
    }
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: slow, fingerprint: () => 'fp1', timing: fast, settleMs: 40 })
    const first = executableRuntime()
    const started = Date.now()
    const one = await runOnce(first.runtime, isolation, ANSWER_ONLY)
    expect(Date.now() - started).toBeLessThan(2500)
    expect(first.opened[0]?.launchArgs ?? []).not.toContain('--strict-mcp-config')
    expect(one.usage).toMatchObject({ envMode: 'native', envModeRequested: 'answer-only', envModeReason: 'unverified' })
    await one.runner.dispose?.()
    await isolation.idle()
    const second = executableRuntime()
    const two = await runOnce(second.runtime, isolation, ANSWER_ONLY)
    expect(second.opened[0]?.launchArgs ?? []).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(two.usage).toMatchObject({ envMode: 'answer-only', envModeReason: 'verified' })
    await two.runner.dispose?.()
  })

  it('a logged-out account cannot prove anything: the call runs native, without a long wait, and nothing is condemned', async () => {
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(world({ loggedIn: false })), fingerprint: () => 'fp1', timing: fast })
    const { runtime, opened } = executableRuntime()
    const started = Date.now()
    const result = await runOnce(runtime, isolation, ANSWER_ONLY)
    expect(Date.now() - started).toBeLessThan(2500)
    expect(opened[0]?.launchArgs ?? []).not.toContain('--strict-mcp-config')
    expect(result.usage).toMatchObject({ envMode: 'native', envModeRequested: 'answer-only' })
    await result.runner.dispose?.()
  })

  it('settle waits for the proof only when something is unproven; native and already-proven versions return at once', async () => {
    const state = world()
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast })
    const call = { cli: 'claude', call: 'answer' as const, modelArg: 'default', version: '2.1.318', env: ANSWER_ONLY }
    await isolation.settle({ ...call, env: { PERSONA_CLI_ENV: 'native' } })
    expect(state.launches).toEqual([])
    await isolation.settle({ ...call, version: undefined as never })
    await isolation.settle({ ...call, cli: 'codex' })
    expect(state.launches).toEqual([])
    await isolation.settle(call)
    expect(isolation.decide(call)).toMatchObject({ effectiveMode: 'answer-only', reason: 'verified' })
    const launches = state.launches.length
    await isolation.settle(call)
    expect(state.launches).toHaveLength(launches)
  })

  it('the wait is counted from the START of the proof: calls of one first delivery that start together are all isolated, and once the proof has run past the limit nobody waits for it again', async () => {
    const state = world()
    const gate = new IsolationGate(memoryIo())
    const slow: OpenControl = (launch) => {
      const inner = fakeOpen(state)(launch)
      return { ...inner, request: async (subtype, params) => { await new Promise<void>((resolve) => { setTimeout(resolve, 20) }); return inner.request(subtype, params) } }
    }
    const isolation = new IsolationRuntime({ gate, open: slow, fingerprint: () => 'fp1', timing: fast, settleMs: 5000 })
    const call = { cli: 'claude', call: 'answer' as const, modelArg: 'default', version: '2.1.318', env: ANSWER_ONLY }
    // three personas start their first turn at the same time: one proof, all three wait for it and come out isolated
    await Promise.all([isolation.settle(call), isolation.settle(call), isolation.settle(call)])
    for (let i = 0; i < 3; i += 1) expect(isolation.decide(call)).toMatchObject({ effectiveMode: 'answer-only', reason: 'verified' })
    const verdictLaunches = state.launches.length
    await isolation.settle(call)
    expect(state.launches).toHaveLength(verdictLaunches)

    // a proof that never ends: the first call waits up to the limit, a call that comes after the limit does not wait again
    const hanging: OpenControl = () => ({ request: () => new Promise<Record<string, unknown>>(() => undefined), close: async () => undefined })
    const stuck = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: hanging, fingerprint: () => 'fp1', timing: fast, settleMs: 80 })
    const first = Date.now()
    await stuck.settle(call)
    expect(Date.now() - first).toBeGreaterThanOrEqual(60)
    const second = Date.now()
    await stuck.settle(call)
    expect(Date.now() - second).toBeLessThan(40)
    expect(stuck.decide(call)).toMatchObject({ effectiveMode: 'native' })
  })

  it('with the switch on native nothing is probed and the usage says native', async () => {
    const state = world()
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp1', timing: fast })
    const { runtime, opened } = executableRuntime()
    const result = await runOnce(runtime, isolation, { PERSONA_CLI_ENV: 'native' })
    expect(opened[0]?.launchArgs ?? []).not.toContain('--strict-mcp-config')
    expect(result.usage.envMode).toBe('native')
    expect(result.usage.envModeRequested).toBeUndefined()
    expect(state.launches).toEqual([])
  })
})
