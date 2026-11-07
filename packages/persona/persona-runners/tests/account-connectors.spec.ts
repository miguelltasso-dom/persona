/**
 * ISO-5 (D-083): load the account connector a request needs, and only that one. The plan, the merge of the single `--settings`, the
 * pre-flight (what it costs, whether it works), the proof once per CLI version, and what the session is opened with. A fake control
 * client reproduces what the REAL CLI was measured to do (reports/iso5-dry.md, mechanism: setting-sources local + allowedMcpServers by URL).
 * No real CLI, no model.
 */
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import type { ControlLaunch, ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { mergeFlagSettings, settingsArgs } from '../src/oar/flag-settings.ts'
import { CLAUDE_CONNECTOR_ARGS, CLAUDE_ISOLATION_ARGS, isolationPlan } from '../src/oar/isolation.ts'
import { IsolationGate, IsolationRuntime, connectorKey, type GateIo } from '../src/oar/isolation-gate.ts'
import { probeConnector } from '../src/oar/isolation-run.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool, sessionPoolKey } from '../src/resolve/session-pool.ts'

const NEEDED = { PERSONA_CLI_ENV: 'needed' }
const ANSWER_ONLY = { PERSONA_CLI_ENV: 'answer-only' }
const URL_A = 'https://proxy.example/v1/mcp/aaaa'
const URL_B = 'https://proxy.example/v1/mcp/bbbb'

function memoryIo(): GateIo & { text(): string | undefined } {
  let text: string | undefined
  return { read: () => text, write: (next) => { text = next }, text: () => text }
}

interface Account { url: string; status: 'connected' | 'needs-auth' | 'failed' }
interface World { loggedIn: boolean; accounts: Account[]; opened: ControlLaunch[]; ignoreAllowList: boolean }
const world = (over: Partial<World> = {}): World => ({ loggedIn: true, accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'connected' }], opened: [], ignoreAllowList: false, ...over })

/** Behaves like the CLI measured on 2.1.318 (reports/iso5-dry.md). */
function fakeOpen(state: World): OpenControl {
  return (launch): ControlSession => {
    state.opened.push(launch)
    const args = launch.args
    const after = (flag: string): string | undefined => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined }
    const sources = after('--setting-sources')
    const settings = JSON.parse(after('--settings') ?? '{}') as { allowedMcpServers?: { serverUrl?: string }[] }
    const allowed = settings.allowedMcpServers?.map(row => row.serverUrl)
    const servers = args.includes('--strict-mcp-config') || sources === 'project' ? []
      : sources?.startsWith('local') === true ? state.accounts.filter(row => state.ignoreAllowList || allowed === undefined || allowed.includes(row.url)) : state.accounts
    return {
      request: async (subtype) => {
        if (subtype === 'initialize') return { account: state.loggedIn ? { subscriptionType: 'x' } : null, commands: args.includes('--disable-slash-commands') ? [] : ['a'] }
        if (subtype === 'mcp_status') return { mcpServers: servers.map(row => ({ status: row.status, config: { url: row.url } })) }
        if (subtype === 'get_context_usage') {
          return { totalTokens: 32_114 + servers.filter(row => row.status === 'connected').length * 1464, categories: [{ name: 'System tools', tokens: args.includes('--tools') ? 0 : 1 }] }
        }
        if (subtype === 'get_settings') return { applied: { model: 'claude-opus-5-5', effort: 'medium' } }
        return {}
      },
      close: async () => undefined,
    }
  }
}

const fast = { arriveMs: 30, pauseMs: 1 }

describe('the plan: one connector, by URL, and nothing else of the environment', () => {
  it('a task in the end-state mode loads exactly the asked URLs: local sources + allow-list, NO strict (strict would block them all)', () => {
    const plan = isolationPlan('claude', { env: NEEDED, call: 'task', accountConnectors: [URL_A, URL_A, URL_B] })
    expect(plan.launchArgs).toEqual([...CLAUDE_CONNECTOR_ARGS])
    expect(plan.launchArgs).not.toContain('--strict-mcp-config')
    // the project's own instructions (CLAUDE.md) live in the `project` source: a connector call must not lose them (measured: `local` alone drops them)
    expect(plan.launchArgs[plan.launchArgs.indexOf('--setting-sources') + 1]).toBe('local,project')
    expect(plan.settings).toEqual({ allowedMcpServers: [{ serverUrl: URL_A }, { serverUrl: URL_B }] })
    expect(plan.accountConnectors).toBe(2)
  })

  it('no connector = the floor, exactly as before', () => {
    const plan = isolationPlan('claude', { env: NEEDED, call: 'task' })
    expect(plan.launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(plan.settings).toBeUndefined()
    expect(plan.accountConnectors).toBeUndefined()
  })

  it('a call WITHOUT tools, answer-only mode, native mode and other CLIs never load a connector', () => {
    expect(isolationPlan('claude', { env: NEEDED, call: 'answer', accountConnectors: [URL_A] }).launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(isolationPlan('claude', { env: ANSWER_ONLY, call: 'task', accountConnectors: [URL_A] }).launchArgs).toEqual([])
    expect(isolationPlan('claude', { env: { PERSONA_CLI_ENV: 'native' }, call: 'task', accountConnectors: [URL_A] }).settings).toBeUndefined()
    expect(isolationPlan('codex', { env: NEEDED, call: 'task', accountConnectors: [URL_A] }).settings).toBeUndefined()
    expect(isolationPlan('opencode', { env: NEEDED, call: 'task', accountConnectors: [URL_A] }).settings).toBeUndefined()
  })

  it('an empty URL is not a connector', () => {
    expect(isolationPlan('claude', { env: NEEDED, call: 'task', accountConnectors: [''] }).launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
  })
})

describe('mergeFlagSettings: the CLI takes ONE --settings', () => {
  it('concatenates hooks, unions the allow-lists, keeps the first of anything else', () => {
    const merged = mergeFlagSettings([
      { allowedMcpServers: [{ serverUrl: URL_A }], theme: 'x' },
      { hooks: { PreToolUse: [{ matcher: 'mcp__.*' }] }, allowedHttpHookUrls: ['http://127.0.0.1:1/hook'], theme: 'y' },
      { hooks: { PreToolUse: [{ matcher: 'other' }] }, allowedMcpServers: [{ serverUrl: URL_A }, { serverUrl: URL_B }], allowedHttpHookUrls: ['http://127.0.0.1:1/hook'] },
    ])
    expect(merged).toEqual({
      allowedMcpServers: [{ serverUrl: URL_A }, { serverUrl: URL_B }],
      theme: 'x',
      hooks: { PreToolUse: [{ matcher: 'mcp__.*' }, { matcher: 'other' }] },
      allowedHttpHookUrls: ['http://127.0.0.1:1/hook'],
    })
  })

  it('nothing to say gives no argument at all', () => {
    expect(mergeFlagSettings([undefined, {}])).toBeUndefined()
    expect(settingsArgs(undefined)).toEqual([])
    expect(settingsArgs({ a: 1 })).toEqual(['--settings', '{"a":1}'])
  })
})

describe('probeConnector: the pre-flight (control requests only)', () => {
  it('loads exactly that connector, connected, and measures what it adds to the opening context against the floor', async () => {
    const state = world()
    const probe = await probeConnector(fakeOpen(state), { url: URL_A, cwd: '.', ...fast })
    expect(probe).toEqual({ ok: true, status: 'connected', extraTokens: 1464, percent: 0.046, basisTokens: 32_114 })
    // it launched with the allow-list for THAT url only
    const loaded = state.opened.find(row => row.args.includes('--settings'))
    expect(JSON.parse(loaded?.args[loaded.args.indexOf('--settings') + 1] ?? '{}')).toEqual({ allowedMcpServers: [{ serverUrl: URL_A }] })
  })

  it('a connector that needs the person to authenticate is NOT usable, and says why', async () => {
    const probe = await probeConnector(fakeOpen(world({ accounts: [{ url: URL_A, status: 'needs-auth' }] })), { url: URL_A, cwd: '.', ...fast })
    expect(probe).toEqual({ ok: false, status: 'needs-auth' })
  })

  it('a failed connector, a connector the account no longer has, and a lost login are not usable', async () => {
    expect((await probeConnector(fakeOpen(world({ accounts: [{ url: URL_A, status: 'failed' }] })), { url: URL_A, cwd: '.', ...fast })).status).toBe('failed')
    expect((await probeConnector(fakeOpen(world({ accounts: [{ url: URL_B, status: 'connected' }] })), { url: URL_A, cwd: '.', ...fast })).status).toBe('absent')
    expect((await probeConnector(fakeOpen(world({ loggedIn: false })), { url: URL_A, cwd: '.', ...fast })).status).toBe('no-login')
  })

  it('FAILS CLOSED when the CLI stops honouring the allow-list (more than the one connector shows up)', async () => {
    const probe = await probeConnector(fakeOpen(world({ ignoreAllowList: true })), { url: URL_A, cwd: '.', ...fast })
    expect(probe).toEqual({ ok: false, status: 'many' })
  })
})

describe('IsolationRuntime.connectorsReady: proven once per CLI version and connector', () => {
  const runtimeOf = (state: World, io = memoryIo(), over: Partial<ConstructorParameters<typeof IsolationRuntime>[0]> = {}) =>
    new IsolationRuntime({ gate: new IsolationGate(io), open: fakeOpen(state), fingerprint: () => 'fp', timing: fast, ...over })

  it('proves an unknown connector inline, then remembers: the second call opens no session', async () => {
    const state = world()
    const runtime = runtimeOf(state)
    expect(await runtime.connectorsReady({ version: '2.1.318', urls: [URL_A] })).toEqual({ usable: [URL_A], dropped: 0 })
    const opened = state.opened.length
    expect(await runtime.connectorsReady({ version: '2.1.318', urls: [URL_A] })).toEqual({ usable: [URL_A], dropped: 0 })
    expect(state.opened.length).toBe(opened)
  })

  it('drops what is not usable and keeps the rest; a new CLI version proves again', async () => {
    const state = world({ accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'needs-auth' }] })
    const runtime = runtimeOf(state)
    expect(await runtime.connectorsReady({ version: 'v1', urls: [URL_A, URL_B] })).toEqual({ usable: [URL_A], dropped: 1 })
    const before = state.opened.length
    await runtime.connectorsReady({ version: 'v2', urls: [URL_A] })
    expect(state.opened.length).toBeGreaterThan(before)
  })

  it('a "not usable" answer is re-checked after 5 minutes (the person may have authenticated); a "usable" one is not', async () => {
    const state = world({ accounts: [{ url: URL_A, status: 'needs-auth' }] })
    let clock = Date.parse('2026-11-04T12:00:00Z')
    const io = memoryIo()
    const gate = new IsolationGate(io, () => new Date(clock).toISOString())
    const runtime = new IsolationRuntime({ gate, open: fakeOpen(state), fingerprint: () => 'fp', timing: fast, now: () => clock })
    expect((await runtime.connectorsReady({ version: 'v', urls: [URL_A] })).usable).toEqual([])
    state.accounts[0] = { url: URL_A, status: 'connected' }
    clock += 60_000
    expect((await runtime.connectorsReady({ version: 'v', urls: [URL_A] })).usable).toEqual([]) // still inside the 5 minutes
    clock += 5 * 60_000
    expect((await runtime.connectorsReady({ version: 'v', urls: [URL_A] })).usable).toEqual([URL_A])
  })

  it('an unknown CLI version proves nothing: every connector is dropped', async () => {
    expect(await runtimeOf(world()).connectorsReady({ version: undefined, urls: [URL_A] })).toEqual({ usable: [], dropped: 1 })
  })

  it('a pre-flight that never answers drops the connector instead of hanging the call', async () => {
    const hanging: OpenControl = () => ({ request: () => new Promise<Record<string, unknown>>(() => undefined), close: async () => undefined })
    const runtime = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: hanging, fingerprint: () => 'fp', timing: fast, connectorTimeoutMs: 40 })
    expect(await runtime.connectorsReady({ version: 'v', urls: [URL_A] })).toEqual({ usable: [], dropped: 1 })
  })

  it('stores a HASH of the URL, never the URL, and only counts and status', async () => {
    const io = memoryIo()
    await runtimeOf(world(), io).connectorsReady({ version: 'v', urls: [URL_A] })
    const text = io.text() ?? ''
    expect(text).not.toContain('proxy.example')
    expect(text).toContain(connectorKey('v', URL_A))
  })

  it('connectorCostOf is what the screen shows BEFORE the person confirms', async () => {
    const runtime = runtimeOf(world())
    expect(await runtime.connectorCostOf({ version: '2.1.318', url: URL_A })).toMatchObject({ ok: true, extraTokens: 1464, percent: 0.046 })
    expect(await runtime.connectorCostOf({ version: undefined, url: URL_A })).toBeUndefined()
  })
})

// ---- through resolveRunner ------------------------------------------------------------------------------------------

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/c', prompt: 'envie o email', model: 'haiku', permissionMode: 'allow-once' }

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

async function task(isolation: IsolationRuntime, accountConnectors: readonly string[], extra: { permissionGate?: PermissionGate } = {}): Promise<{ options: SessionOptions; runner: Runner; usage: Awaited<ReturnType<Runner['usage']>> }> {
  const { runtime, opened } = executableRuntime()
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/c',
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: NEEDED, isolation, accountConnectors, ...extra,
  })
  const handle = await runner.start(input)
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session opened')
  return { options, runner, usage: await runner.usage(handle) }
}

describe('resolveRunner opens the session with the connector the request needs', () => {
  const provenRuntime = async (state: World) => {
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp', timing: fast })
    await isolation.warm({ version: '2.1.318', mode: 'needed', modelArg: 'haiku', env: NEEDED })
    return isolation
  }

  it('a proven connector goes in as local sources + an allow-list by URL, no strict, and the usage says one was loaded', async () => {
    const isolation = await provenRuntime(world())
    const { options, runner, usage } = await task(isolation, [URL_A])
    const args = options.launchArgs ?? []
    expect(args).toEqual(expect.arrayContaining([...CLAUDE_CONNECTOR_ARGS]))
    expect(args).not.toContain('--strict-mcp-config')
    expect(JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}')).toEqual({ allowedMcpServers: [{ serverUrl: URL_A }] })
    expect(usage).toMatchObject({ envMode: 'needed', connectorsLoaded: 1, connectorsDropped: 0 })
    await runner.dispose?.()
  })

  it('a connector that needs authentication is dropped: the call runs at the floor and the usage says so', async () => {
    const isolation = await provenRuntime(world({ accounts: [{ url: URL_A, status: 'needs-auth' }] }))
    const { options, runner, usage } = await task(isolation, [URL_A])
    expect(options.launchArgs).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(options.launchArgs ?? []).not.toContain('--settings')
    expect(usage).toMatchObject({ connectorsLoaded: 0, connectorsDropped: 1 })
    await runner.dispose?.()
  })

  it('with the permission gate the allow-list and the hook share ONE --settings, and no guarded tool is in an allow rule', async () => {
    const isolation = await provenRuntime(world())
    const gate = await PermissionGate.start({ token: 'tok' })
    try {
      gate.arm()
      const { options, runner } = await task(isolation, [URL_A], { permissionGate: gate })
      const args = options.launchArgs ?? []
      expect(args.filter(arg => arg === '--settings')).toHaveLength(1)
      const merged = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as { allowedMcpServers: unknown[]; hooks: { PreToolUse: { hooks: { url: string }[] }[] }; allowedHttpHookUrls: string[] }
      expect(merged.allowedMcpServers).toEqual([{ serverUrl: URL_A }])
      expect(merged.hooks.PreToolUse[0]?.hooks[0]?.url).toBe(gate.url)
      expect(merged.allowedHttpHookUrls).toEqual([gate.url])
      expect(args.join(' ')).not.toMatch(/--allowedTools|--allowed-tools/u)
      await runner.dispose?.()
    } finally {
      await gate.close()
    }
  })

  it('no connector asked: nothing is probed for connectors and the floor is used', async () => {
    const state = world()
    const isolation = await provenRuntime(state)
    const before = state.opened.length
    const { options, runner, usage } = await task(isolation, [])
    expect(state.opened.length).toBe(before)
    expect(options.launchArgs).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(usage.connectorsLoaded).toBeUndefined()
    await runner.dispose?.()
  })

  it('the pool tells runners with different connectors apart (and leaves the old key alone when there are none)', () => {
    const base = { personaId: 'nina', projectId: 'p1', purpose: 'task' as const, provider: 'claude', model: 'haiku', cwd: 'C:/x', permissionMode: 'allow-once', toolLevel: 'write' }
    expect(sessionPoolKey({ ...base, connectors: URL_A })).not.toBe(sessionPoolKey({ ...base, connectors: URL_B }))
    expect(sessionPoolKey({ ...base, connectors: URL_A })).not.toBe(sessionPoolKey(base))
    expect(sessionPoolKey(base)).toBe('nina|p1|task|claude|haiku|C:/x|allow-once|write|')
  })
})
