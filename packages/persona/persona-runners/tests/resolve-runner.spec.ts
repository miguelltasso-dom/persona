import { delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RunnerResolveError,
  createSessionPool,
  detectConnections,
  pickConnectedCli,
  disposeRunnerSessions,
  loginHintFor,
  idleTeamMayCallModel,
  modelForPurpose,
  modelForWork,
  TRIAGE_CALL_CAP,
  triageCallsAllowed,
  pickFastestModel,
  prewarmCoordination,
  toUiConnection,
  probeCliBinary,
  resetConnectionCache,
  resetProbeCache,
  resolveRunner,
  type DshAgentPort,
  type MeasuredUsage,
  type RunEvent,
  type TurnRunner,
} from '../src/index.ts'
import { runResolverSmoke, runWarmPairSmoke } from '../src/resolve/smoke.ts'

const FAKE_CLI = join(dirname(fileURLToPath(import.meta.url)), '../../persona-e2e/fixtures/fake-cli')

function sayingRuntime(overrides: {
  installation?: { kind: string; version?: string }
  auth?: { kind: string }
  models?: readonly string[]
  usage?: unknown
} = {}) {
  const base = scriptedRuntime({
    id: 'fake-cli',
    turn: (turn) => { turn.say('OK') },
  })
  return Object.assign(base, {
    installation: async () => overrides.installation ?? { kind: 'available', via: 'bundled', version: '2.1.317 (fake-persona-e2e)' },
    authStatus: async () => overrides.auth ?? { kind: 'logged_in' },
    listModels: async () => ({
      kind: 'ok',
      models: (overrides.models ?? ['haiku', 'scripted-1']).map(id => ({ id })),
    }),
    accountUsage: async () => overrides.usage ?? { windows: [] },
  })
}

const dshAgent = (): DshAgentPort => ({
  start: async () => ({
    sessionId: 'dsh-1',
    events: (async function *() {
      yield { type: 'text' as const, text: 'OK' }
      yield { type: 'ended' as const, text: 'OK' }
    })(),
  }),
  resume: async () => ({
    sessionId: 'dsh-1',
    events: (async function *() {
      yield { type: 'ended' as const, text: 'OK' }
    })(),
  }),
  cancel: async () => undefined,
  usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
})

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

afterEach(async () => {
  resetConnectionCache()
  resetProbeCache()
  await disposeRunnerSessions()
})

describe('resolveRunner', () => {
  it('wraps a scripted Claude CLI and records usage', async () => {
    const records: MeasuredUsage[] = []
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      usage: { record: (entry) => { records.push(entry) } },
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({
      ticketId: 't',
      assignmentId: 'a',
      personaId: 'nina',
      cwd: 'C:/tmp',
      prompt: 'hi',
      model: 'haiku',
    })
    const events = await collect(runner.stream(handle))
    expect(events.some(item => item.type === 'delta' && item.text === 'OK')).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]?.provider).toBe('claude')
    expect(records[0]?.origin).toBe('measured')
    expect(records[0]?.kind).toBe('execution')
  })

  it('holds OpenCode to its own permission block (D-103a)', async () => {
    const seen: Array<Readonly<Record<string, string | null>> | undefined> = []
    const base = sayingRuntime()
    const runtime = {
      ...base,
      session: async (...args: Parameters<typeof base.session>) => {
        seen.push(args[1]?.env)
        return base.session(...args)
      },
    }
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'opencode', model: 'haiku' },
      permissionMode: 'allow-once',
      tools: { files: 'write' },
      runtime,
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({ ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku' })
    await collect(runner.stream(handle))
    const content = seen[0]?.OPENCODE_CONFIG_CONTENT
    expect(typeof content).toBe('string')
    expect(JSON.parse(content ?? '{}')).toMatchObject({ permission: { bash: 'deny', edit: 'allow', external_directory: 'deny', webfetch: 'deny' } })
  })

  it('writes measured usage into an injected UsageStore', async () => {
    const events: Array<{ personaId: string; projectId: string; origin: string; inputTokens: number }> = []
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      usageStore: { record: (entry) => { events.push(entry) } },
      usageScope: { personaId: 'nina', projectId: 'p1' },
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku',
    })
    await collect(runner.stream(handle))
    expect(events).toEqual([expect.objectContaining({
      personaId: 'nina', projectId: 'p1', origin: 'measured', kind: 'execution',
    })])
  })

  it('throws typed pt-BR errors without stacks or secrets', async () => {
    const vault = { get: async () => 'sk-test-secret-xyz' }
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ installation: { kind: 'missing' } }),
      vault,
      personId: 'p1',
    })).rejects.toMatchObject({ code: 'cli_not_found' })
    resetProbeCache()
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'codex', model: 'gpt-5.5' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ auth: { kind: 'logged_out' } }),
    })).rejects.toBeInstanceOf(RunnerResolveError)
    resetProbeCache()
    // EFF-1 (Atlas 05/11): a chosen model the engine does not offer no longer drops the Task: it runs on the engine's default and the usage says so (tests/eff1-runner.spec.ts)
    const dropped = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'opus-missing' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ models: ['haiku'] }),
    })
    expect(typeof dropped.start).toBe('function')
    resetProbeCache()
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ usage: { windows: [{ id: '5h', usedPercent: 100, resetsAt: '2026-11-04T21:30:00.000Z' }] } }),
    })).rejects.toMatchObject({ code: 'quota_exhausted', provider: 'Claude', resetAt: '2026-11-04T21:30:00.000Z' })
    resetProbeCache()
    try {
      await resolveRunner({
        spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
        permissionMode: 'deny',
        runtime: sayingRuntime({ auth: { kind: 'logged_out' } }),
        vault,
        personId: 'p1',
      })
    } catch (error) {
      expect(error).toBeInstanceOf(RunnerResolveError)
      expect(String(error)).not.toContain('sk-test-secret-xyz')
      expect((error as Error).stack ?? '').toMatch(/RunnerResolveError/u)
      expect((error as RunnerResolveError).message).toMatch(/não está conectado/u)
      expect((error as RunnerResolveError).provider).toBe('Claude')
      expect((error as RunnerResolveError).command).toBe('claude login')
    }
  })

  it('observe-gates propose autonomy and still resolves DSH', async () => {
    const inner = sayingRuntime()
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      autonomy: 'propose',
      runtime: inner,
    })
    const handle = await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku',
    })
    const events = await collect(runner.stream(handle))
    expect(events.some(item => item.type === 'ended' && item.report.state === 'waiting')).toBe(true)

    const dsh = await resolveRunner({
      spec: { kind: 'dsh', model: 'deepseek-chat' },
      permissionMode: 'deny',
      agent: dshAgent(),
    })
    const started = await dsh.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'deepseek-chat',
    })
    expect((await collect(dsh.stream(started))).some(item => item.type === 'delta')).toBe(true)
  })

  it('pins haiku for talk and keeps the persona model for task', () => {
    expect(pickFastestModel({ kind: 'cli', cli: 'claude', model: '' })).toBe('haiku')
    expect(modelForPurpose({ kind: 'cli', cli: 'claude', model: 'sonnet' }, 'talk')).toBe('haiku')
    expect(modelForPurpose({ kind: 'cli', cli: 'claude', model: 'sonnet', talkModel: 'haiku' }, 'talk')).toBe('haiku')
    expect(modelForPurpose({ kind: 'cli', cli: 'claude', model: 'sonnet' }, 'task')).toBe('sonnet')
    expect(modelForWork({ kind: 'cli', cli: 'claude', model: 'sonnet' }, 'librarian')).toBe('haiku')
    expect(modelForWork({ kind: 'cli', cli: 'claude', model: 'sonnet' }, 'watchdog')).toBe('haiku')
    expect(modelForWork({ kind: 'cli', cli: 'claude', model: 'sonnet' }, 'task')).toBe('sonnet')
    expect(idleTeamMayCallModel(false)).toBe(false)
    expect(idleTeamMayCallModel(true)).toBe(true)
    expect(TRIAGE_CALL_CAP).toBe(1)
    expect(triageCallsAllowed(0)).toBe(true)
    expect(triageCallsAllowed(1)).toBe(false)
  })

  it('skips a second cheap triage call without booting the CLI', async () => {
    let installs = 0
    const runtime = Object.assign(sayingRuntime(), {
      installation: async () => {
        installs += 1
        return { kind: 'available' as const, via: 'bundled' as const }
      },
    })
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'sonnet' },
      permissionMode: 'deny',
      runtime,
      purpose: 'talk',
      turnKind: 'triage',
      triageCallsAlready: 1,
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp', prompt: 'hi', model: 'haiku',
    })
    const events = await collect(runner.stream(handle))
    expect(installs).toBe(0)
    expect(events.some(item => item.type === 'ended')).toBe(true)
    expect(await runner.usage(handle)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('reuses the pooled runner so the second resolve does not boot again', async () => {
    let installs = 0
    const runtime = Object.assign(sayingRuntime(), {
      installation: async () => {
        installs += 1
        return { kind: 'available' as const, via: 'bundled' as const }
      },
    })
    const pool = createSessionPool<TurnRunner>()
    const options = {
      spec: { kind: 'cli' as const, cli: 'claude' as const, model: 'haiku' },
      permissionMode: 'deny' as const,
      runtime,
      personId: 'nina',
      projectId: 'p1',
      cwd: 'C:/tmp/pool',
      pool,
      infra: { wait: async () => undefined },
    }
    const first = await resolveRunner(options)
    const second = await resolveRunner(options)
    expect(second).toBe(first)
    expect(installs).toBe(1)
    await pool.disposeAll()
  })

  it('prewarms Coordination without a model prompt', async () => {
    let opens = 0
    let prompts = 0
    const inner = sayingRuntime()
    const runtime = {
      ...inner,
      session: async (installation: Parameters<typeof inner.session>[0], options: Parameters<typeof inner.session>[1]) => {
        opens += 1
        const session = await inner.session(installation, options)
        return new Proxy(session, {
          get(target, prop, receiver) {
            if (prop === 'prompt') {
              return async (...args: Parameters<typeof session.prompt>) => {
                prompts += 1
                return target.prompt(...args)
              }
            }
            const value = Reflect.get(target, prop, receiver)
            return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(target) : value
          },
        })
      },
    }
    const runner = await prewarmCoordination({
      spec: { kind: 'cli', cli: 'claude', model: 'sonnet' },
      permissionMode: 'deny',
      runtime,
      personaId: 'coord',
      projectId: 'p1',
      cwd: 'C:/tmp/warm',
      personId: 'coord',
      pool: createSessionPool<TurnRunner>(),
      infra: { wait: async () => undefined },
    })
    expect(opens).toBe(1)
    expect(prompts).toBe(0)
    expect(runner.prime).toBeTypeOf('function')
    expect(runner.dispose).toBeTypeOf('function')
  })
})

describe('detectConnections + fake CLI fixtures', () => {
  it('shares concurrent detection and probes CLIs in parallel', async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const runtime = Object.assign(sayingRuntime(), {
      installation: async () => { calls += 1; await gate; return { kind: 'available' } },
    })
    const options = { timeoutMs: 2_000, runtimes: { claude: runtime, codex: runtime, opencode: runtime, cursor: runtime } }
    const first = detectConnections(options)
    const second = detectConnections(options)
    await vi.waitFor(() => { expect(calls).toBe(4) })
    release()
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(a.filter(card => card.kind === 'cli' && card.loggedIn)).toHaveLength(4)
  })

  it('keeps installation timeouts unknown and a confirmed login when models time out', async () => {
    const hungInstallation = Object.assign(sayingRuntime(), {
      installation: () => new Promise<{ kind: string }>(() => undefined),
    })
    const hungModels = Object.assign(sayingRuntime(), {
      listModels: () => new Promise<{ models: never[] }>(() => undefined),
    })
    const cards = await detectConnections({
      timeoutMs: 50, force: true,
      runtimes: { claude: hungInstallation, codex: hungModels, opencode: sayingRuntime(), cursor: sayingRuntime() },
    })
    expect(cards.find(card => card.id === 'claude')).toMatchObject({ authUnknown: true, installed: false })
    expect(cards.find(card => card.id === 'claude')?.error).toBeUndefined()
    expect(cards.find(card => card.id === 'codex')).toMatchObject({ loggedIn: true, installed: true })
    expect(cards.find(card => card.id === 'codex')?.authUnknown).toBeUndefined()
  })

  it('reads Probe fake-cli --version and never leaks a token', async () => {
    const previous = process.env.PATH ?? ''
    process.env.PATH = `${FAKE_CLI}${delimiter}${previous}`
    try {
      const pending = probeCliBinary('claude')
      expect(pending).toBeInstanceOf(Promise)
      const probed = await pending
      expect(probed.ok).toBe(true)
      expect(probed.version).toMatch(/fake-persona-e2e/u)
      const cards = await detectConnections({
        force: true,
        timeoutMs: 2_000,
        env: { ...process.env, DEEPSEEK_API_KEY: 'sk-test-secret-xyz' },
        runtimes: {
          claude: sayingRuntime({
            installation: probed.version === undefined
              ? { kind: 'available' }
              : { kind: 'available', version: probed.version },
          }),
          codex: sayingRuntime({ auth: { kind: 'logged_out' } }),
          opencode: sayingRuntime(),
          cursor: sayingRuntime({ auth: { kind: 'logged_out' } }),
        },
      })
      const claude = cards.find(item => item.id === 'claude')
      expect(claude?.installed).toBe(true)
      expect(claude?.loggedIn).toBe(true)
      expect(claude?.version).toMatch(/fake-persona-e2e/u)
      const dsh = cards.find(item => item.id === 'dsh')
      expect(dsh?.loggedIn).toBe(true)
      expect(JSON.stringify(cards)).not.toContain('sk-test-secret-xyz')
      expect(loginHintFor('claude')).toMatch(/claude login/u)
      const again = await detectConnections({ cacheMs: 60_000, runtimes: { claude: sayingRuntime() } })
      expect(again).toBe(cards)
      expect(pickConnectedCli(cards)).toBe('claude')
    } finally {
      process.env.PATH = previous
    }
  })

  it('picks Codex when Claude is logged out and skips dsh', () => {
    expect(pickConnectedCli([
      { id: 'dsh', kind: 'dsh', installed: true, loggedIn: true, models: ['default'] },
      { id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [] },
      { id: 'codex', kind: 'cli', installed: true, loggedIn: true, models: ['default'] },
    ])).toBe('codex')
    expect(pickConnectedCli([
      { id: 'claude', kind: 'cli', installed: true, loggedIn: true, authUnknown: true, models: [] },
    ])).toBeUndefined()
  })
})

describe('detectConnections official quota', () => {
  it('keeps Claude Max / Codex ChatGPT official windows (0% is official, timeout is not checking)', async () => {
    resetConnectionCache()
    const cards = await detectConnections({
      force: true,
      timeoutMs: 2_000,
      runtimes: {
        claude: sayingRuntime({
          usage: {
            kind: 'ok',
            plan: 'max',
            five_hour: { utilization: 0, window_minutes: 300, resets_at: 1_762_286_400 },
            seven_day: { remaining_percent: 91, window_minutes: 10_080 },
          },
        }),
        codex: sayingRuntime({
          auth: { kind: 'logged_in' },
          usage: {
            kind: 'logged_in',
            subscription: 'chatgpt',
            rate_limits: {
              '5h': { used_percent: 18, window_minutes: 300 },
              weekly: { used_percent: 6, window_minutes: 10_080 },
            },
          },
        }),
        opencode: sayingRuntime(),
        cursor: sayingRuntime({ auth: { kind: 'logged_out' } }),
      },
    })
    const claude = cards.find(item => item.id === 'claude')
    expect(claude?.usageOrigin).toBe('official')
    expect(claude?.officialQuota?.windows[0]).toMatchObject({ id: '5h', usedPercent: 0 })
    expect(claude?.officialQuota?.windows[1]?.id).toBe('week')
    const codex = cards.find(item => item.id === 'codex')
    expect(codex?.usageOrigin).toBe('official')
    expect(codex?.officialQuota?.detail).toBe('chatgpt')
    resetConnectionCache()
    const hung = Object.assign(sayingRuntime(), {
      accountUsage: () => new Promise<unknown>(() => undefined),
    })
    const timed = await detectConnections({
      force: true,
      timeoutMs: 40,
      runtimes: {
        claude: hung,
        codex: sayingRuntime({ auth: { kind: 'logged_out' } }),
        opencode: sayingRuntime(),
        cursor: sayingRuntime({ auth: { kind: 'logged_out' } }),
      },
    })
    expect(timed.find(item => item.id === 'claude')?.officialQuota?.detail).toBe('accountUsage timeout')
  })
})

describe('resolver smoke (scripted)', () => {
  it('reports network failures with the provider code without leaking technical text', async () => {
    resetProbeCache()
    const runtime = Object.assign(sayingRuntime(), {
      accountUsage: async () => { throw new Error('fetch failed: ECONNRESET secret-marker') },
    })
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', runtime,
    })).rejects.toMatchObject({
      code: 'provider_unreachable', provider: 'Claude', message: 'Não consegui falar com o Claude agora.',
    })
  })
  it('measures first token and types a not_logged_in row', async () => {
    const rows = await runResolverSmoke({
      runtimes: {
        claude: sayingRuntime(),
        codex: sayingRuntime({ auth: { kind: 'logged_out' } }),
        opencode: sayingRuntime(),
        cursor: sayingRuntime({ auth: { kind: 'logged_out' } }),
      },
      cwd: 'C:/tmp/smoke',
      connections: { timeoutMs: 2_000, force: true },
    })
    const claude = rows.find(item => item.id === 'claude')
    expect(claude?.execs).toBe(1)
    expect(claude?.done).toBe(true)
    expect(claude?.firstTokenMs).toBeTypeOf('number')
    expect(rows.find(item => item.id === 'codex')?.error?.code).toBe('not_logged_in')
    const cursor = rows.find(item => item.id === 'cursor')
    expect(cursor?.error?.code).toBe('not_logged_in')
    expect(cursor?.error?.message).toBe('O Cursor não está conectado neste computador.')
    expect(loginHintFor('cursor')).toMatch(/Persona nunca pede sua senha/u)
    expect(JSON.stringify(cursor)).not.toMatch(/at /u)
  }, 15_000)

  it('measures first and second message on the same warm session', async () => {
    const rows = await runWarmPairSmoke({
      pairs: 1,
      cli: 'claude',
      cwd: 'C:/tmp/warm',
      runtimes: { claude: sayingRuntime() },
      connections: { timeoutMs: 2_000, force: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.first.done).toBe(true)
    expect(rows[0]?.second.done).toBe(true)
    expect(rows[0]?.first.kinds).toContain('delta')
    expect(rows[0]?.second.kinds).toContain('partial')
  }, 15_000)
})

describe('connection UI payload', () => {
  it('does not treat an auth timeout as not_logged_in', async () => {
    resetConnectionCache()
    const hung = Object.assign(sayingRuntime(), {
      authStatus: () => new Promise<{ kind: string }>(() => undefined),
    })
    const cards = await detectConnections({
      timeoutMs: 40,
      force: true,
      runtimes: {
        claude: hung,
        codex: sayingRuntime(),
        opencode: sayingRuntime(),
        cursor: sayingRuntime(),
      },
    })
    const claude = cards.find(item => item.id === 'claude')
    expect(claude?.installed).toBe(true)
    expect(claude?.authUnknown).toBe(true)
    expect(claude?.error?.code).not.toBe('not_logged_in')
    const row = toUiConnection(claude!)
    expect(row.error?.code).not.toBe('not_logged_in')
    expect(row.loginHint).toBe('')
  })

  it('forwards typed not_logged_in plus loginHint without a stack', () => {
    const row = toUiConnection({
      id: 'cursor',
      kind: 'cli',
      installed: true,
      loggedIn: false,
      models: [],
      loginHint: loginHintFor('cursor'),
      error: { code: 'not_logged_in', message: new RunnerResolveError('not_logged_in', 'cursor').message },
    })
    expect(row.loginHint).toMatch(/Persona nunca pede sua senha/u)
    expect(row.error?.code).toBe('not_logged_in')
    expect(row.error?.message).toBe('O Cursor não está conectado neste computador.')
    expect(row.error?.message).not.toMatch(/CLI|runner|DSH/u)
  })

  it('executes WAVE2 account policy at the limit and isolates config dirs', async () => {
    const work = {
      id: 'work', provider: 'claude', label: 'Trabalho', configDir: 'C:/p/accounts/m/claude/work',
    }
    const personal = {
      id: 'personal', provider: 'claude', label: 'Pessoal', configDir: 'C:/p/accounts/m/claude/personal',
    }
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      accounts: [work, personal],
      accountPolicy: { kind: 'fixed', scope: 'persona', accountIds: ['work'] },
      accountQuotas: [{ accountId: 'work', exhausted: true }],
      accountId: 'work',
      infra: { wait: async () => undefined },
    })).rejects.toMatchObject({ code: 'quota_exhausted' })
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      accounts: [work, personal],
      accountPolicy: { kind: 'ask_before_swap', scope: 'workspace', accountIds: ['work', 'personal'] },
      accountQuotas: [{ accountId: 'work', exhausted: true }],
      accountId: 'work',
      infra: { wait: async () => undefined },
    })).rejects.toMatchObject({ code: 'quota_exhausted' })

    let env: Record<string, string | null> | undefined
    const inner = sayingRuntime()
    const open = inner.session.bind(inner)
    const runtime = Object.assign(inner, {
      session: async (installation: Parameters<typeof open>[0], options: Parameters<typeof open>[1]) => {
        env = options.env === undefined ? undefined : { ...options.env }
        return open(installation, options)
      },
    })
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime,
      accounts: [work, personal],
      accountPolicy: { kind: 'next_on_limit', scope: 'workspace', accountIds: ['work', 'personal'] },
      accountQuotas: [
        { accountId: 'work', exhausted: true },
        { accountId: 'personal', exhausted: false, remainingPercent: 70 },
      ],
      accountId: 'work',
      homeIo: { mkdir: () => undefined },
      infra: { wait: async () => undefined },
    })
    await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp',
      prompt: 'hi', model: 'haiku', permissionMode: 'deny',
    })
    expect(env?.CLAUDE_CONFIG_DIR?.replaceAll('\\', '/')).toMatch(/accounts\/m\/claude\/personal$/u)
    expect(env?.CODEX_HOME).toBeNull()
  })
})
