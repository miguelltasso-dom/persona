/**
 * ISO-1 reoriented by D-084: "load only what the call needs". The plan per CLI, per MODE and per kind of call (pure), the ports the
 * host reads, and the wiring through `resolveRunner` (what the session is actually opened with). No real CLI, no model.
 * Contract: persona-spec/contracts/cli-isolation.md. The effect of each flag was proven DRY on the real login
 * (reports/iso-dry-claude.json, reports/iso-dry-product.json).
 */
import { join } from 'node:path'
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  CLAUDE_ISOLATION_ARGS,
  CLAUDE_ISOLATION_ENV,
  CLI_ENV_SWITCH,
  DEFAULT_CLI_ENV_MODE,
  NOT_ISOLATED,
  cliEnvMode,
  cliIsolation,
  cliIsolationReport,
  isolationPlan,
} from '../src/oar/isolation.ts'
import { cliPolicyOf } from '../src/resolve/cli-policy.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'
import type { Runner, StartTurnInput } from '../src/contract.ts'

const NATIVE = { [CLI_ENV_SWITCH]: 'native' }
const ANSWER_ONLY = { [CLI_ENV_SWITCH]: 'answer-only' }
const NEEDED = { [CLI_ENV_SWITCH]: 'needed' }

describe('the mode: which calls get the plan', () => {
  it('reads the switch; anything else is the default', () => {
    expect(cliEnvMode(NATIVE)).toBe('native')
    expect(cliEnvMode(ANSWER_ONLY)).toBe('answer-only')
    expect(cliEnvMode(NEEDED)).toBe('needed')
    expect(cliEnvMode({ [CLI_ENV_SWITCH]: 'whatever' })).toBe(DEFAULT_CLI_ENV_MODE)
    expect(cliEnvMode({})).toBe(DEFAULT_CLI_ENV_MODE)
  })

  it('the default is `needed` (D-096; it was `answer-only` since AO-1/D-085): every Claude and OpenCode call loads only what it needs; Codex and Cursor are left alone and say so', () => {
    expect(DEFAULT_CLI_ENV_MODE).toBe('needed')
    for (const call of ['answer', 'task'] as const) {
      const claude = isolationPlan('claude', { env: {}, call })
      expect(claude.level).toBe('full')
      expect(claude.launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
      expect(claude.env).toEqual(CLAUDE_ISOLATION_ENV)
      const opencode = isolationPlan('opencode', { env: {}, call })
      expect(opencode.level).toBe('full')
      expect(opencode.launchArgs).toEqual([])
      expect(opencode.env.XDG_CONFIG_HOME).toBeDefined()
      expect(opencode.ensureDir).toBeDefined()
      // nothing safe to pass to Codex and nothing to pass to Cursor: unchanged launch, and the plan says what is not isolated
      const codex = isolationPlan('codex', { env: {}, call })
      expect(codex.level).toBe('partial')
      expect(codex.launchArgs).toEqual([])
      expect(codex.env).toEqual({})
      const cursor = isolationPlan('cursor', { env: {}, call })
      expect(cursor.level).toBe('none')
      expect(cursor.launchArgs).toEqual([])
      expect(cursor.env).toEqual({})
    }
  })
})

describe('isolationPlan in the end state (`needed`): what each CLI allows (proven dry)', () => {
  it('Claude is full: no MCP of any scope, no user settings, no personal skills, native login untouched', () => {
    const plan = isolationPlan('claude', { env: NEEDED })
    expect(plan.level).toBe('full')
    expect(plan.notIsolated).toEqual([])
    expect(plan.launchArgs).toEqual(['--strict-mcp-config', '--setting-sources', 'project', '--disable-slash-commands'])
    expect(plan.env).toEqual({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_AGENT_PROGRESS_SUMMARIES: '1',
      CLAUDE_CODE_DISABLE_ORG_MEMORY: '1',
    })
    expect(plan.ensureDir).toBeUndefined()
    // the same for a call with and without tools
    expect(isolationPlan('claude', { env: NEEDED, call: 'answer' })).toEqual(plan)
  })

  it('never reaches for the login: no --bare (API key only), no config-dir redirect, no credential file anywhere in the plan', () => {
    const text = JSON.stringify(isolationPlan('claude', { env: NEEDED }))
    expect(text).not.toMatch(/--bare|CLAUDE_CONFIG_DIR|credentials|auth\.json|HOME|USERPROFILE/u)
  })

  it('keeps OUT of the default the two keys that are unproven: they shrink the model list / could break a backgrounded shell', () => {
    expect(CLAUDE_ISOLATION_ENV).not.toHaveProperty('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')
    expect(CLAUDE_ISOLATION_ENV).not.toHaveProperty('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS')
    expect(CLAUDE_ISOLATION_ARGS).not.toContain('--bare')
  })

  it('OpenCode is full through an EMPTY product config root (its login lives in the data directory); it refuses launchArgs', () => {
    const plan = isolationPlan('opencode', { env: NEEDED, productConfigRoot: join('C:', 'prod') })
    expect(plan.level).toBe('full')
    expect(plan.launchArgs).toEqual([])
    expect(plan.env).toEqual({ XDG_CONFIG_HOME: join('C:', 'prod', 'opencode-config') })
    expect(plan.ensureDir).toBe(join('C:', 'prod', 'opencode-config'))
    expect(JSON.stringify(plan)).not.toMatch(/XDG_DATA_HOME|auth/u)
  })

  it('Codex is partial and changes NOTHING (a flag cannot clear its MCP; copying auth.json would risk the login); it says what is not isolated', () => {
    const plan = isolationPlan('codex', { env: NEEDED })
    expect(plan.level).toBe('partial')
    expect(plan.launchArgs).toEqual([])
    expect(plan.env).toEqual({})
    expect(plan.notIsolated).toEqual(expect.arrayContaining([NOT_ISOLATED.mcp, NOT_ISOLATED.plugins, NOT_ISOLATED.hooks, NOT_ISOLATED.skills, NOT_ISOLATED.instructions]))
    expect(plan.ensureDir).toBeUndefined()
  })

  it('Cursor and anything unknown are none, with no argument and no env', () => {
    for (const cli of ['cursor', 'dsh', 'whatever']) {
      const plan = isolationPlan(cli, { env: NEEDED })
      expect(plan.level).toBe('none')
      expect(plan.launchArgs).toEqual([])
      expect(plan.env).toEqual({})
      expect(plan.notIsolated.length).toBeGreaterThan(0)
    }
  })
})

describe('`answer-only`: the first step. A call WITHOUT tools can never use a connector (dontAsk denies it), so loading none loses nothing', () => {
  it('Claude no-tools calls get the full plan', () => {
    expect(isolationPlan('claude', { env: ANSWER_ONLY, call: 'answer' })).toEqual(isolationPlan('claude', { env: NEEDED, call: 'answer' }))
  })

  it('Claude calls WITH tools, and every other CLI, are left exactly as they were', () => {
    expect(isolationPlan('claude', { env: ANSWER_ONLY, call: 'task' }).launchArgs).toEqual([])
    expect(isolationPlan('claude', { env: ANSWER_ONLY, call: 'task' }).env).toEqual({})
    for (const cli of ['opencode', 'codex', 'cursor']) {
      for (const call of ['answer', 'task'] as const) {
        const plan = isolationPlan(cli, { env: ANSWER_ONLY, call })
        expect(plan.launchArgs).toEqual([])
        expect(plan.env).toEqual({})
        expect(plan.ensureDir).toBeUndefined()
      }
    }
  })
})

describe('the native switch and the ports', () => {
  it('`native` restores the old launch for every CLI and every call', () => {
    for (const cli of ['claude', 'opencode', 'codex', 'cursor']) {
      for (const call of ['answer', 'task'] as const) {
        const plan = isolationPlan(cli, { env: NATIVE, call })
        expect(plan.level).toBe('none')
        expect(plan.launchArgs).toEqual([])
        expect(plan.env).toEqual({})
        expect(plan.ensureDir).toBeUndefined()
      }
    }
  })

  it('the ports the host reads agree with the plan of the mode in force', () => {
    expect(cliIsolation('claude', NEEDED)).toBe('full')
    expect(cliIsolation('opencode', NEEDED)).toBe('full')
    expect(cliIsolation('codex', NEEDED)).toBe('partial')
    expect(cliIsolation('cursor', NEEDED)).toBe('none')
    // the default is `needed` (D-096), so Claude reports `full` with no switch; `answer-only` leaves calls WITH tools alone and reports `none` (never more than exists)
    expect(cliIsolation('claude', {})).toBe('full')
    expect(cliIsolation('claude', ANSWER_ONLY)).toBe('none')
    expect(cliIsolationReport('codex', NEEDED)).toEqual({ level: 'partial', notIsolated: isolationPlan('codex', { env: NEEDED }).notIsolated })
    expect(cliIsolationReport('claude', NEEDED)).toEqual({ level: 'full', notIsolated: [] })
  })
})

// ---- the wiring: what the session is actually opened with ----------------------------------------------------------

const input: StartTurnInput = {
  ticketId: 't-iso1', assignmentId: 'a-iso1', personaId: 'nina', cwd: 'C:/tmp/iso1', prompt: 'oi', model: 'haiku', permissionMode: 'deny',
}

/** A scripted runtime that records the options of every session it is asked to open. */
function capturing(): { runtime: Runtime; opened: SessionOptions[] } {
  const opened: SessionOptions[] = []
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  // keep the original: Object.assign mutates `base`, and the wrapper must not call itself
  const openOriginal = base.session.bind(base)
  const runtime = Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled', version: '2.1.318 (fake-persona)' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }, { id: 'default' }] }),
    session: async (installation: unknown, options: SessionOptions) => {
      opened.push(options)
      return openOriginal(installation as never, options)
    },
  })
  return { runtime: runtime as unknown as Runtime, opened }
}

async function openWith(
  cli: 'claude' | 'codex' | 'opencode' | 'cursor',
  env: NodeJS.ProcessEnv,
  extra: { permissionMode?: 'deny' | 'allow-once'; made?: string[] } = {},
): Promise<{ options: SessionOptions; runner: Runner }> {
  const { runtime, opened } = capturing()
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli, model: 'haiku' },
    permissionMode: extra.permissionMode ?? 'deny',
    runtime,
    personId: 'nina',
    projectId: 'p1',
    cwd: 'C:/tmp/iso1',
    pool: createSessionPool<Runner>(),
    infra: { wait: async () => undefined },
    env,
    homeIo: { mkdir: (dir: string) => { extra.made?.push(dir) } },
  })
  const handle = await runner.start({ ...input, permissionMode: extra.permissionMode ?? 'deny' })
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session was opened')
  return { options, runner }
}

describe('resolveRunner opens the session with only what the call needs (additive to the vendor policy)', () => {
  it('by default (needed, D-096) a Claude call WITHOUT tools and a task WITH tools both open with only what they need loaded (the floor: no connector was granted)', async () => {
    const answer = await openWith('claude', {})
    expect(answer.options.launchArgs).toEqual([...cliPolicyOf('claude', {}, 'deny').launchArgs, ...CLAUDE_ISOLATION_ARGS])
    expect(answer.options.env).toMatchObject(CLAUDE_ISOLATION_ENV)
    await answer.runner.dispose?.()
    const task = await openWith('claude', {}, { permissionMode: 'allow-once' })
    expect(task.options.launchArgs).toEqual([...cliPolicyOf('claude', {}, 'allow-once').launchArgs, ...CLAUDE_ISOLATION_ARGS])
    expect(task.options.env).toMatchObject(CLAUDE_ISOLATION_ENV)
    await task.runner.dispose?.()
  })

  it('Claude, no-tools call, `answer-only`: the vendor policy stays first and untouched, the isolation arguments follow, the env carries the keys', async () => {
    const { options, runner } = await openWith('claude', ANSWER_ONLY)
    const vendor = cliPolicyOf('claude', {}, 'deny')
    expect(options.launchArgs).toEqual([...vendor.launchArgs, ...CLAUDE_ISOLATION_ARGS])
    expect(options.launchArgs?.slice(0, 6)).toEqual(['--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', ''])
    expect(options.env).toMatchObject(CLAUDE_ISOLATION_ENV)
    await runner.dispose?.()
  })

  it('Claude, call WITH tools, `answer-only`: left exactly as before (a task may need a connector; the router decides that, HT-10)', async () => {
    const { options, runner } = await openWith('claude', ANSWER_ONLY, { permissionMode: 'allow-once' })
    const vendor = cliPolicyOf('claude', {}, 'allow-once')
    expect(options.launchArgs).toEqual([...vendor.launchArgs])
    expect(options.disallowedTools).toEqual(vendor.disallowedTools)
    await runner.dispose?.()
  })

  it('Claude, call with tools, `needed`: same plan, and the deny-list of write tools is still passed', async () => {
    const { options, runner } = await openWith('claude', NEEDED, { permissionMode: 'allow-once' })
    const vendor = cliPolicyOf('claude', {}, 'allow-once')
    expect(options.launchArgs).toEqual([...vendor.launchArgs, ...CLAUDE_ISOLATION_ARGS])
    expect(options.disallowedTools).toEqual(vendor.disallowedTools)
    await runner.dispose?.()
  })

  it('the native-login overlay is kept: no CLAUDE_CONFIG_DIR is set by the isolation, only removed as before', async () => {
    const { options, runner } = await openWith('claude', NEEDED)
    expect(options.env?.CLAUDE_CONFIG_DIR ?? null).toBeNull()
    await runner.dispose?.()
  })

  it('switch=native: no isolation argument and no isolation key reach the session', async () => {
    const { options, runner } = await openWith('claude', NATIVE)
    expect(options.launchArgs).toEqual([...cliPolicyOf('claude', {}, 'deny').launchArgs])
    for (const key of Object.keys(CLAUDE_ISOLATION_ENV)) expect(options.env ?? {}).not.toHaveProperty(key)
    await runner.dispose?.()
  })

  it('OpenCode (`needed` only): XDG_CONFIG_HOME points at the empty product directory and that directory is created; no launchArgs', async () => {
    const made: string[] = []
    const { options, runner } = await openWith('opencode', NEEDED, { made })
    const expected = isolationPlan('opencode', { env: NEEDED })
    expect(options.env).toMatchObject({ XDG_CONFIG_HOME: expected.env.XDG_CONFIG_HOME })
    expect(made).toEqual([expected.ensureDir])
    expect(options.launchArgs).toBeUndefined()
    await runner.dispose?.()
  })

  it('OpenCode under `answer-only`: untouched (a provider defined only in the person\'s opencode.json must keep resolving)', async () => {
    const made: string[] = []
    const { options, runner } = await openWith('opencode', ANSWER_ONLY, { made })
    expect(options.env?.XDG_CONFIG_HOME ?? null).toBeNull()
    expect(made).toEqual([])
    await runner.dispose?.()
  })

  it('Codex: opened exactly as before in every mode (partial, nothing changed)', async () => {
    for (const env of [{}, ANSWER_ONLY, NEEDED]) {
      const { options, runner } = await openWith('codex', env)
      expect(options.launchArgs ?? []).toEqual([...cliPolicyOf('codex', {}, 'deny').launchArgs])
      // the native-login overlay REMOVES it (null, as before); the isolation must not point it anywhere
      expect(options.env?.XDG_CONFIG_HOME ?? null).toBeNull()
      for (const key of Object.keys(CLAUDE_ISOLATION_ENV)) expect(options.env ?? {}).not.toHaveProperty(key)
      await runner.dispose?.()
    }
  })
})
