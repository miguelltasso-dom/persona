/**
 * D-096 (the owner, 05/11): `needed` is the default, with two fallbacks to `native`. GUARD tests for both runner-side halves:
 *  (1) the proof of the CLI version fails -> native (the fallback that already existed; it must keep working under the new default);
 *  (2) a GRANTED connector the isolated launch could not reach -> native ONCE, only that call, decided before the first token, with a typed signal
 *      (`connectorsUnreached` by position, `connectorsFallback`), no URL in it, nothing sticky, nothing pooled; `needs-auth`/`no-login` stay at the floor.
 * A fake control client reproduces what the REAL CLI was measured to do (reports/iso5-dry.md). No real CLI, no model.
 * The fake account (`unreachedWorld()`, `fakeOpen()`) lives in `support/unreached-world.ts`, shared with the host's guard test of the fallback (Anvil).
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { ConnectorUnreached, Runner, StartTurnInput } from '../src/contract.ts'
import { NATIVE_CAN_REACH, connectorFallback, unreachedReasonOf } from '../src/oar/connector-reach.ts'
import { CLAUDE_ISOLATION_ARGS, CLI_ENV_SWITCH, DEFAULT_CLI_ENV_MODE, cliCapabilityReport, cliEnvMode, isolationPlan } from '../src/oar/isolation.ts'
import { IsolationGate, IsolationRuntime, type GateIo } from '../src/oar/isolation-gate.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'
import { URL_A, URL_B, fakeOpen, unreachedWorld, type UnreachedWorld } from './support/unreached-world.ts'

const NEEDED = { PERSONA_CLI_ENV: 'needed' }

function memoryIo(): GateIo { let text: string | undefined; return { read: () => text, write: (next) => { text = next } } }

const fast = { arriveMs: 30, pauseMs: 1 }
const runtimeOf = (state: UnreachedWorld, over: Partial<ConstructorParameters<typeof IsolationRuntime>[0]> = {}): IsolationRuntime =>
  new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp', timing: fast, ...over })
const provenRuntime = async (state: UnreachedWorld, over: Partial<ConstructorParameters<typeof IsolationRuntime>[0]> = {}): Promise<IsolationRuntime> => {
  const isolation = runtimeOf(state, over)
  await isolation.warm({ version: '2.1.318', mode: 'needed', modelArg: 'haiku', env: NEEDED })
  return isolation
}

describe('D-096: the default mode is `needed`', () => {
  it('one constant: unset = needed; every mode is still reachable by the switch', () => {
    expect(DEFAULT_CLI_ENV_MODE).toBe('needed')
    expect(cliEnvMode({})).toBe('needed')
    expect(cliEnvMode({ [CLI_ENV_SWITCH]: 'answer-only' })).toBe('answer-only')
    expect(cliEnvMode({ [CLI_ENV_SWITCH]: 'native' })).toBe('native')
    expect(cliEnvMode({ [CLI_ENV_SWITCH]: 'nonsense' })).toBe('needed')
  })

  it('a task with tools is isolated by default (floor), loads only the granted connector, and the screen says "selected"', () => {
    const floor = isolationPlan('claude', { env: {}, call: 'task' })
    expect(floor.level).toBe('full')
    expect(floor.launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    const granted = isolationPlan('claude', { env: {}, call: 'task', accountConnectors: [URL_A] })
    expect(granted.accountConnectors).toBe(1)
    expect(cliCapabilityReport('claude', {}).connectors).toBe('selected')
    // answer-only is still a switch, and there a task with tools runs native
    expect(isolationPlan('claude', { env: { [CLI_ENV_SWITCH]: 'answer-only' }, call: 'task' }).launchArgs).toEqual([])
  })
})

describe('the policy of the second fallback (pure)', () => {
  it('only the reasons the native launch can still cure go native; sign-in problems stay at the floor', () => {
    expect([...NATIVE_CAN_REACH].sort()).toEqual(['absent', 'failed', 'many', 'timeout'])
    const row = (reason: ConnectorUnreached['reason'], ordinal = 0): ConnectorUnreached => ({ ordinal, reason })
    expect(connectorFallback([])).toBeUndefined()
    for (const reason of ['absent', 'failed', 'many', 'timeout'] as const) expect(connectorFallback([row(reason)])).toBe('native-once')
    for (const reason of ['needs-auth', 'no-login'] as const) expect(connectorFallback([row(reason)])).toBe('floor')
    // one of several is enough to try native (nothing is lost by it: the gate's mandate bounds what the task may touch)
    expect(connectorFallback([row('needs-auth'), row('absent', 1)])).toBe('native-once')
  })

  it('maps a pre-flight record to a code; a pre-flight that did not finish is a timeout; a usable one has none', () => {
    expect(unreachedReasonOf(undefined)).toBe('timeout')
    expect(unreachedReasonOf({ ok: true, status: 'connected' })).toBeUndefined()
    for (const status of ['needs-auth', 'failed', 'absent', 'many', 'no-login'] as const) expect(unreachedReasonOf({ ok: false, status })).toBe(status)
    expect(unreachedReasonOf({ ok: false, status: 'connected' })).toBe('failed')
  })
})

describe('IsolationRuntime.connectorsReach: the proof, with the WHY (and connectorsReady untouched)', () => {
  it('says why each unusable connector is unusable, by URL (the caller maps it to a position); usable ones are listed', async () => {
    const state = unreachedWorld({ accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'needs-auth' }] })
    const runtime = runtimeOf(state)
    expect(await runtime.connectorsReach({ version: '2.1.318', urls: [URL_A, URL_B, URL_A] })).toEqual({ usable: [URL_A], dropped: 1, unreached: [{ url: URL_B, reason: 'needs-auth' }] })
    // the old answer is the same shape as before
    expect(await runtime.connectorsReady({ version: '2.1.318', urls: [URL_A, URL_B] })).toEqual({ usable: [URL_A], dropped: 1 })
  })

  it('absent, many and failed are told apart; an unknown CLI version cannot be proven (failed)', async () => {
    expect((await runtimeOf(unreachedWorld({ accounts: [] })).connectorsReach({ version: 'v', urls: [URL_A] })).unreached).toEqual([{ url: URL_A, reason: 'absent' }])
    expect((await runtimeOf(unreachedWorld({ ignoreAllowList: true })).connectorsReach({ version: 'v', urls: [URL_A] })).unreached).toEqual([{ url: URL_A, reason: 'many' }])
    expect((await runtimeOf(unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })).connectorsReach({ version: 'v', urls: [URL_A] })).unreached).toEqual([{ url: URL_A, reason: 'failed' }])
    expect(await runtimeOf(unreachedWorld()).connectorsReach({ version: undefined, urls: [URL_A, URL_B] })).toEqual({
      usable: [], dropped: 2, unreached: [{ url: URL_A, reason: 'failed' }, { url: URL_B, reason: 'failed' }],
    })
  })

  it('a pre-flight that never answers is a timeout; not being signed in is no-login', async () => {
    const slow = runtimeOf(unreachedWorld({ hangConnector: true }), { connectorTimeoutMs: 30 })
    expect((await slow.connectorsReach({ version: 'v', urls: [URL_A] })).unreached).toEqual([{ url: URL_A, reason: 'timeout' }])
    expect((await runtimeOf(unreachedWorld({ loggedIn: false })).connectorsReach({ version: 'v', urls: [URL_A] })).unreached).toEqual([{ url: URL_A, reason: 'no-login' }])
  })
})

// ---- through resolveRunner ------------------------------------------------------------------------------------------

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/c', prompt: 'liste os rotulos', model: 'haiku', permissionMode: 'allow-once' }

function executableRuntime(): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'executable', command: 'claude', version: '2.1.318' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    session: async (installation: unknown, options: SessionOptions) => { opened.push(options); return openOriginal(installation as never, options) },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

type Usage = Awaited<ReturnType<Runner['usage']>>
interface Ran { readonly options: SessionOptions; readonly usage: Usage; readonly args: readonly string[] }

async function task(
  isolation: IsolationRuntime,
  accountConnectors: readonly string[],
  extra: { permissionGate?: PermissionGate; pool?: ReturnType<typeof createSessionPool<Runner>>; permissionMode?: 'allow-once' | 'deny' } = {},
): Promise<Ran> {
  const { runtime, opened } = executableRuntime()
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: extra.permissionMode ?? 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/c',
    pool: extra.pool ?? createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: {}, isolation, accountConnectors,
    ...(extra.permissionGate === undefined ? {} : { permissionGate: extra.permissionGate }),
  })
  const handle = await runner.start({ ...input, permissionMode: extra.permissionMode ?? 'allow-once' })
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session opened')
  const usage = await runner.usage(handle)
  await runner.dispose?.()
  return { options, usage, args: options.launchArgs ?? [] }
}

const isolatedLaunch = (args: readonly string[]): boolean => args.includes('--setting-sources') || args.includes('--strict-mcp-config')

describe('resolveRunner: the second fallback, decided before the first token', () => {
  it('every granted connector reached: the call runs needed with it and says nothing about a fallback', async () => {
    const ran = await task(await provenRuntime(unreachedWorld()), [URL_A])
    expect(ran.usage).toMatchObject({ envMode: 'needed', connectorsLoaded: 1, connectorsDropped: 0 })
    expect(ran.usage.envModeRequested).toBeUndefined()
    expect(ran.usage.connectorsUnreached).toBeUndefined()
    expect(ran.usage.connectorsFallback).toBeUndefined()
    expect(isolatedLaunch(ran.args)).toBe(true)
  })

  it.each([
    ['failed', unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })],
    ['absent', unreachedWorld({ accounts: [] })],
    ['many', unreachedWorld({ ignoreAllowList: true })],
  ] as const)('a granted connector that is %s: THIS call runs NATIVE (no isolation arguments), and the usage says what was asked, what ran and why', async (reason, world) => {
    const ran = await task(await provenRuntime(world), [URL_A])
    expect(isolatedLaunch(ran.args)).toBe(false)
    expect(ran.args).not.toContain('--settings') // no allow-list: native loads the account's connectors by itself
    expect(ran.usage).toMatchObject({ envMode: 'native', envModeRequested: 'needed', envModeReason: 'connector-unreached', connectorsUnreached: [{ ordinal: 0, reason }], connectorsFallback: 'native-once' })
    // the counts of the isolated launch say nothing true about a native one: they are left out
    expect(ran.usage.connectorsLoaded).toBeUndefined()
    expect(ran.usage.connectorsDropped).toBeUndefined()
  })

  it('a connector whose pre-flight never answers is a timeout: native once, within the pre-flight deadline (not a hang)', async () => {
    const ran = await task(await provenRuntime(unreachedWorld({ hangConnector: true }), { connectorTimeoutMs: 30 }), [URL_A])
    expect(ran.usage).toMatchObject({ envMode: 'native', envModeReason: 'connector-unreached', connectorsUnreached: [{ ordinal: 0, reason: 'timeout' }], connectorsFallback: 'native-once' })
  })

  it('a connector that needs the person to sign in again stays at the FLOOR (native cannot reach it either and would cost ~300 000 tokens per request): the usage says floor and reconnect-able', async () => {
    const ran = await task(await provenRuntime(unreachedWorld({ accounts: [{ url: URL_A, status: 'needs-auth' }] })), [URL_A])
    expect(ran.usage).toMatchObject({ envMode: 'needed', connectorsLoaded: 0, connectorsDropped: 1, connectorsUnreached: [{ ordinal: 0, reason: 'needs-auth' }], connectorsFallback: 'floor' })
    expect(ran.usage.envModeRequested).toBeUndefined()
    expect(ran.args).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
  })

  it('the position is in the DEDUPLICATED list the host passed (first occurrence), so the host can map it back; two granted, one missing', async () => {
    const world = unreachedWorld({ accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'failed' }] })
    const first = await task(await provenRuntime(world), [URL_A, URL_A, URL_B])
    expect(first.usage.connectorsUnreached).toEqual([{ ordinal: 1, reason: 'failed' }])
    const second = await task(await provenRuntime(unreachedWorld({ accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'failed' }] })), [URL_B, URL_A])
    expect(second.usage.connectorsUnreached).toEqual([{ ordinal: 0, reason: 'failed' }])
  })

  it('no URL (and nothing else of the connector) leaves the runner in the usage', async () => {
    const ran = await task(await provenRuntime(unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })), [URL_A])
    expect(JSON.stringify(ran.usage)).not.toContain('proxy.example')
    expect(JSON.stringify(ran.usage)).not.toContain('aaaa')
  })

  it('ONCE and only that call: the fallback runner is never pooled, and the next call is decided again (the connector came back: needed again)', async () => {
    const world = unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })
    // the gate stamps its records with the real clock; the runtime's clock only has to start from it (a fixed date would age the records by however far today is from it)
    let clock = Date.now()
    const isolation = await provenRuntime(world, { now: () => clock })
    const pool = createSessionPool<Runner>()
    const first = await task(isolation, [URL_A], { pool })
    expect(first.usage).toMatchObject({ envMode: 'native', connectorsFallback: 'native-once' })
    // the connector is repaired; a "not usable" verdict of the CLI is re-checked after 5 minutes
    world.accounts = [{ url: URL_A, status: 'connected' }]
    clock += 6 * 60_000
    const second = await task(isolation, [URL_A], { pool })
    expect(second.usage).toMatchObject({ envMode: 'needed', connectorsLoaded: 1, connectorsDropped: 0 })
    expect(second.usage.connectorsFallback).toBeUndefined()
    expect(isolatedLaunch(second.args)).toBe(true)
  })

  it('a call WITHOUT tools (deny) never asks for a connector, so it never falls back', async () => {
    const world = unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })
    const ran = await task(await provenRuntime(world), [URL_A], { permissionMode: 'deny' })
    expect(ran.usage.connectorsUnreached).toBeUndefined()
    expect(ran.usage.connectorsFallback).toBeUndefined()
    expect(ran.usage.envMode).toBe('needed')
  })

  it('the FIRST fallback is unchanged under the new default: a CLI version whose proof failed runs native with its own reason, and says nothing about connectors', async () => {
    const world = unreachedWorld({ isolationBroken: true })
    const ran = await task(await provenRuntime(world), [URL_A])
    expect(ran.usage).toMatchObject({ envMode: 'native', envModeRequested: 'needed' })
    expect(ran.usage.envModeReason).not.toBe('connector-unreached')
    expect(ran.usage.connectorsUnreached).toBeUndefined()
    expect(ran.usage.connectorsFallback).toBeUndefined()
  })

  it('the mandate survives the fallback: the permission gate hook is still in the ONE --settings of a native call, and no tool is allow-listed', async () => {
    const gate = await PermissionGate.start({ token: 'tok' })
    try {
      gate.arm({ allowedServers: ['fixture'] })
      const ran = await task(await provenRuntime(unreachedWorld({ accounts: [{ url: URL_A, status: 'failed' }] })), [URL_A], { permissionGate: gate })
      expect(ran.usage.connectorsFallback).toBe('native-once')
      expect(ran.args.filter(arg => arg === '--settings')).toHaveLength(1)
      const merged = JSON.parse(ran.args[ran.args.indexOf('--settings') + 1] ?? '{}') as { allowedMcpServers?: unknown; hooks: { PreToolUse: { hooks: { url: string }[] }[] } }
      expect(merged.hooks.PreToolUse[0]?.hooks[0]?.url).toBe(gate.url)
      expect(merged.allowedMcpServers).toBeUndefined()
      expect(ran.args.join(' ')).not.toMatch(/--allowedTools|--allowed-tools/u)
    } finally {
      await gate.close()
    }
  })
})
