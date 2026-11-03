import { delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RunnerResolveError,
  createSessionPool,
  detectConnections,
  disposeRunnerSessions,
  loginHintFor,
  modelForPurpose,
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
      personaId: 'nina', projectId: 'p1', origin: 'measured',
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
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'opus-missing' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ models: ['haiku'] }),
    })).rejects.toMatchObject({ code: 'model_unavailable' })
    resetProbeCache()
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime({ usage: { windows: [{ id: '5h', usedPercent: 100 }] } }),
    })).rejects.toMatchObject({ code: 'quota_exhausted' })
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
      expect((error as RunnerResolveError).message).toMatch(/não está logada/u)
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
  it('reads Probe fake-cli --version and never leaks a token', async () => {
    const previous = process.env.PATH ?? ''
    process.env.PATH = `${FAKE_CLI}${delimiter}${previous}`
    try {
      const probed = probeCliBinary('claude')
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
    } finally {
      process.env.PATH = previous
    }
  })
})

describe('resolver smoke (scripted)', () => {
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
    expect(cursor?.error?.message).toBe(loginHintFor('cursor'))
    expect(cursor?.error?.message).toMatch(/Cursor/u)
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
      error: { code: 'not_logged_in', message: `CLI cursor não está logada. ${loginHintFor('cursor')}` },
    })
    expect(row.loginHint).toBe('Abra o Cursor e faça login no Agent')
    expect(row.error?.code).toBe('not_logged_in')
    expect(row.error?.message).toContain(row.loginHint)
    expect(row.error?.message).not.toMatch(/RunnerResolveError/u)
  })
})
