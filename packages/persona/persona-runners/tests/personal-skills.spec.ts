/**
 * HT-11: the person's own Claude skills, by the person's option (OFF by default). The folder of pointers (real temp directories, real
 * junctions/symlinks), the plan, the per-version proof (fake control that behaves like the CLI measured in reports/ht11-skills-dry*.json),
 * and what the session is opened with. No real CLI, no model.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it } from 'vitest'
import type { Runner, StartTurnInput } from '../src/contract.ts'
import type { ControlLaunch, ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { CLAUDE_CONNECTOR_ARGS, CLAUDE_ISOLATION_ARGS, isolationPlan } from '../src/oar/isolation.ts'
import { IsolationGate, IsolationRuntime, type GateIo } from '../src/oar/isolation-gate.ts'
import { probeSkills } from '../src/oar/isolation-run.ts'
import { syncSkillsRoot } from '../src/oar/personal-skills.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool, sessionPoolKey } from '../src/resolve/session-pool.ts'

const NEEDED = { PERSONA_CLI_ENV: 'needed' }
const temps: string[] = []
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'ht11-spec-')); temps.push(dir); return dir }

function skillsSource(names: readonly string[]): string {
  const source = temp()
  for (const name of names) {
    mkdirSync(join(source, name), { recursive: true })
    writeFileSync(join(source, name, 'SKILL.md'), `---\nname: ${name}\n---\nbody never read by the product\n`)
  }
  return source
}

function memoryIo(): GateIo { let text: string | undefined; return { read: () => text, write: (next) => { text = next } } }

describe('the folder of pointers', () => {
  it('points at each skill folder (a pointer, not a copy), and never writes inside the person\'s folder', () => {
    const source = skillsSource(['alpha', 'beta'])
    const root = temp()
    const before = readdirSync(source).sort()
    const folder = syncSkillsRoot({ source, root })
    expect(folder).toEqual({ root, count: 2 })
    const pointer = join(root, '.claude', 'skills', 'alpha')
    expect(lstatSync(pointer).isSymbolicLink()).toBe(true)
    expect(existsSync(join(pointer, 'SKILL.md'))).toBe(true)
    expect(readdirSync(source).sort()).toEqual(before)
    expect(readdirSync(join(source, 'alpha'))).toEqual(['SKILL.md'])
  })

  it('is idempotent, picks up new skills, and drops the pointer of a removed skill WITHOUT touching the skill', () => {
    const source = skillsSource(['alpha', 'beta'])
    const root = temp()
    syncSkillsRoot({ source, root })
    expect(syncSkillsRoot({ source, root })?.count).toBe(2)
    rmSync(join(source, 'beta'), { recursive: true })
    mkdirSync(join(source, 'gamma'))
    writeFileSync(join(source, 'gamma', 'SKILL.md'), 'x')
    expect(syncSkillsRoot({ source, root })?.count).toBe(2)
    expect(readdirSync(join(root, '.claude', 'skills')).sort()).toEqual(['alpha', 'gamma'])
    // removing a pointer never reaches the skill behind it
    rmSync(join(source, 'gamma', 'SKILL.md'))
    expect(syncSkillsRoot({ source, root })?.count).toBe(1)
    expect(existsSync(join(source, 'alpha', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(source, 'gamma'))).toBe(true)
  })

  it('skips what is not a skill: no SKILL.md, plain files, names with separators or dots-only; nothing to load = undefined', () => {
    const source = skillsSource(['ok'])
    mkdirSync(join(source, 'no-manifest'))
    writeFileSync(join(source, 'stray.txt'), 'x')
    mkdirSync(join(source, '..hidden'))
    writeFileSync(join(source, '..hidden', 'SKILL.md'), 'x')
    const root = temp()
    expect(syncSkillsRoot({ source, root })?.count).toBe(1)
    expect(readdirSync(join(root, '.claude', 'skills'))).toEqual(['ok'])
    expect(syncSkillsRoot({ source: join(source, 'missing'), root: temp() })).toBeUndefined()
    expect(syncSkillsRoot({ source: temp(), root: temp() })).toBeUndefined()
  })

  it('never removes or replaces something in the product folder that is NOT a pointer', () => {
    const source = skillsSource(['alpha'])
    const root = temp()
    mkdirSync(join(root, '.claude', 'skills', 'alpha'), { recursive: true })
    writeFileSync(join(root, '.claude', 'skills', 'alpha', 'mine.txt'), 'x')
    mkdirSync(join(root, '.claude', 'skills', 'kept'))
    syncSkillsRoot({ source, root })
    expect(existsSync(join(root, '.claude', 'skills', 'alpha', 'mine.txt'))).toBe(true)
    expect(existsSync(join(root, '.claude', 'skills', 'kept'))).toBe(true)
  })
})

describe('the plan: skills only when asked, proven, for a call with tools, in the end-state mode', () => {
  const root = 'C:/product/personal-skills'
  it('brings the folder in with --add-dir and turns slash commands back on, nothing else of the floor changes', () => {
    const plan = isolationPlan('claude', { env: NEEDED, call: 'task', personalSkills: root })
    expect(plan.launchArgs).toEqual(['--strict-mcp-config', '--setting-sources', 'project', '--add-dir', root])
    expect(plan.launchArgs).not.toContain('--disable-slash-commands')
    expect(plan.personalSkills).toBe(true)
    expect(plan.level).toBe('full')
    // the user setting source is NEVER requested (it carries the person's permission allow-list, model and effort)
    expect(plan.launchArgs.join(' ')).not.toMatch(/user/u)
  })

  it('combines with an account connector: local sources + allow-list + the folder', () => {
    const plan = isolationPlan('claude', { env: NEEDED, call: 'task', personalSkills: root, accountConnectors: ['https://proxy.example/v1/mcp/a'] })
    expect(plan.launchArgs).toEqual(['--setting-sources', 'local,project', '--add-dir', root])
    expect(plan.settings).toEqual({ allowedMcpServers: [{ serverUrl: 'https://proxy.example/v1/mcp/a' }] })
  })

  it('OFF (the default) is exactly the floor; a call without tools, other modes and other CLIs never get the folder', () => {
    expect(isolationPlan('claude', { env: NEEDED, call: 'task' }).launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(isolationPlan('claude', { env: NEEDED, call: 'answer', personalSkills: root }).launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(isolationPlan('claude', { env: { PERSONA_CLI_ENV: 'answer-only' }, call: 'task', personalSkills: root }).launchArgs).toEqual([])
    expect(isolationPlan('claude', { env: { PERSONA_CLI_ENV: 'native' }, call: 'task', personalSkills: root }).launchArgs).toEqual([])
    expect(isolationPlan('codex', { env: NEEDED, call: 'task', personalSkills: root }).launchArgs).toEqual([])
    expect(isolationPlan('opencode', { env: NEEDED, call: 'task', personalSkills: root }).launchArgs).toEqual([])
    expect(isolationPlan('claude', { env: NEEDED, call: 'task', personalSkills: '' }).launchArgs).toEqual([...CLAUDE_ISOLATION_ARGS])
    expect(CLAUDE_CONNECTOR_ARGS).toContain('--disable-slash-commands')
  })
})

interface SkillsWorld { loggedIn: boolean; extra: number; leakEffort: boolean; opened: ControlLaunch[] }
const skillsWorld = (over: Partial<SkillsWorld> = {}): SkillsWorld => ({ loggedIn: true, extra: 21, leakEffort: false, opened: [], ...over })

/** Behaves like the CLI measured on 2.1.318 (reports/ht11-skills-dry2.json): 55 built-in commands, +21 with the folder, same opening total. */
function fakeOpen(state: SkillsWorld): OpenControl {
  return (launch): ControlSession => {
    state.opened.push(launch)
    const args = launch.args
    const slashOn = !args.includes('--disable-slash-commands')
    const withFolder = args.includes('--add-dir')
    return {
      request: async (subtype) => {
        if (subtype === 'initialize') return { account: state.loggedIn ? { subscriptionType: 'x' } : null, commands: Array.from({ length: slashOn ? 55 + (withFolder ? state.extra : 0) : 0 }, (_, at) => `c${String(at)}`) }
        if (subtype === 'get_settings') return { applied: { model: 'claude-opus-5-5', effort: state.leakEffort && withFolder ? 'xhigh' : 'medium' } }
        if (subtype === 'mcp_status') return { mcpServers: [] }
        if (subtype === 'get_context_usage') return { totalTokens: slashOn ? 23_899 : 31_414 }
        return {}
      },
      close: async () => undefined,
    }
  }
}

describe('probeSkills: the folder must add the person\'s skills and NOTHING else', () => {
  const root = 'C:/product/personal-skills'
  it('loaded: more commands than the same launch without the folder, same model and effort, no MCP', async () => {
    const probe = await probeSkills(fakeOpen(skillsWorld()), { root, cwd: '.' })
    expect(probe).toEqual({ ok: true, status: 'loaded', extraCommands: 21, openingTokens: 23_899, baselineTokens: 23_899 })
  })
  it('fails closed when the CLI also changes the effort (the user settings leaked in)', async () => {
    expect(await probeSkills(fakeOpen(skillsWorld({ leakEffort: true })), { root, cwd: '.' })).toEqual({ ok: false, status: 'leaks-settings' })
  })
  it('none: the folder brings nothing (a CLI that stopped reading --add-dir skills)', async () => {
    expect(await probeSkills(fakeOpen(skillsWorld({ extra: 0 })), { root, cwd: '.' })).toEqual({ ok: false, status: 'none' })
  })
  it('a lost login is not "loaded"', async () => {
    expect((await probeSkills(fakeOpen(skillsWorld({ loggedIn: false })), { root, cwd: '.' })).status).toBe('no-login')
  })
})

describe('IsolationRuntime.skillsReady: proven once per CLI version', () => {
  const runtimeOf = (state: SkillsWorld, over: Partial<ConstructorParameters<typeof IsolationRuntime>[0]> = {}) =>
    new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp', timing: { arriveMs: 10, pauseMs: 1 }, ...over })

  it('proves inline, then remembers: the second call opens no session; a new version proves again', async () => {
    const state = skillsWorld()
    const runtime = runtimeOf(state)
    expect((await runtime.skillsReady({ version: 'v1', root: 'R' }))?.ok).toBe(true)
    const opened = state.opened.length
    expect((await runtime.skillsReady({ version: 'v1', root: 'R' }))?.ok).toBe(true)
    expect(state.opened.length).toBe(opened)
    await runtime.skillsReady({ version: 'v2', root: 'R' })
    expect(state.opened.length).toBeGreaterThan(opened)
  })

  it('a "no" is re-checked after 5 minutes; an unknown version proves nothing; a probe that never answers is a "no"', async () => {
    const state = skillsWorld({ extra: 0 })
    let clock = Date.parse('2026-11-04T12:00:00Z')
    const gate = new IsolationGate(memoryIo(), () => new Date(clock).toISOString())
    const runtime = new IsolationRuntime({ gate, open: fakeOpen(state), fingerprint: () => 'fp', timing: { arriveMs: 10, pauseMs: 1 }, now: () => clock })
    expect((await runtime.skillsReady({ version: 'v', root: 'R' }))?.ok).toBe(false)
    state.extra = 21
    clock += 60_000
    expect((await runtime.skillsReady({ version: 'v', root: 'R' }))?.ok).toBe(false)
    clock += 5 * 60_000
    expect((await runtime.skillsReady({ version: 'v', root: 'R' }))?.ok).toBe(true)
    expect(await runtimeOf(skillsWorld()).skillsReady({ version: undefined, root: 'R' })).toBeUndefined()
    const hanging: OpenControl = () => ({ request: () => new Promise<Record<string, unknown>>(() => undefined), close: async () => undefined })
    const stuck = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: hanging, fingerprint: () => 'fp', connectorTimeoutMs: 40 })
    expect(await stuck.skillsReady({ version: 'v', root: 'R' })).toBeUndefined()
  })
})

// ---- through resolveRunner ------------------------------------------------------------------------------------------

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/c', prompt: 'organize a pasta', model: 'haiku', permissionMode: 'allow-once' }

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

async function task(isolation: IsolationRuntime, personalSkills: boolean | { source?: string; root?: string }, over: { env?: NodeJS.ProcessEnv; permissionMode?: 'allow-once' | 'deny' } = {}): Promise<{ options: SessionOptions; runner: Runner; usage: Awaited<ReturnType<Runner['usage']>> }> {
  const { runtime, opened } = executableRuntime()
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: over.permissionMode ?? 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/c',
    pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: over.env ?? NEEDED, isolation, personalSkills,
  })
  const handle = await runner.start(input)
  for await (const event of runner.stream(handle)) if (event.type === 'ended') break
  const options = opened[0]
  if (options === undefined) throw new Error('no session opened')
  return { options, runner, usage: await runner.usage(handle) }
}

describe('resolveRunner opens the session with the person\'s skills only when they asked', () => {
  const provenRuntime = async (state: SkillsWorld) => {
    const isolation = new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp', timing: { arriveMs: 10, pauseMs: 1 } })
    await isolation.warm({ version: '2.1.318', mode: 'needed', modelArg: 'haiku', env: NEEDED })
    return isolation
  }

  it('option ON and proven: --add-dir with the product folder, slash commands back on, usage says loaded', async () => {
    const source = skillsSource(['alpha', 'beta'])
    const root = temp()
    const isolation = await provenRuntime(skillsWorld())
    const { options, runner, usage } = await task(isolation, { source, root })
    const args = options.launchArgs ?? []
    expect(args).toEqual(expect.arrayContaining(['--add-dir', root]))
    expect(args).not.toContain('--disable-slash-commands')
    expect(args.join(' ')).not.toMatch(/--setting-sources user/u)
    expect(usage).toMatchObject({ envMode: 'needed', personalSkills: 'loaded' })
    await runner.dispose?.()
  })

  it('option ON but the CLI version is not proven for skills: the call runs at the floor and the usage says dropped', async () => {
    const source = skillsSource(['alpha'])
    const root = temp()
    const isolation = await provenRuntime(skillsWorld({ extra: 0 }))
    const { options, runner, usage } = await task(isolation, { source, root })
    expect(options.launchArgs).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(options.launchArgs ?? []).not.toContain('--add-dir')
    expect(usage).toMatchObject({ personalSkills: 'dropped' })
    await runner.dispose?.()
  })

  it('option ON but the person has no skills: nothing to load, floor, dropped', async () => {
    const isolation = await provenRuntime(skillsWorld())
    const { options, runner, usage } = await task(isolation, { source: temp(), root: temp() })
    expect(options.launchArgs ?? []).not.toContain('--add-dir')
    expect(usage).toMatchObject({ personalSkills: 'dropped' })
    await runner.dispose?.()
  })

  it('option OFF (the default): no folder is built, no probe is run, the floor is used, and the usage says nothing about skills', async () => {
    const state = skillsWorld()
    const isolation = await provenRuntime(state)
    const before = state.opened.length
    const { options, runner, usage } = await task(isolation, false)
    expect(state.opened.length).toBe(before)
    expect(options.launchArgs).toEqual(expect.arrayContaining([...CLAUDE_ISOLATION_ARGS]))
    expect(usage.personalSkills).toBeUndefined()
    await runner.dispose?.()
  })

  it('a call without tools never gets them even if the option is on', async () => {
    const source = skillsSource(['alpha'])
    const isolation = await provenRuntime(skillsWorld())
    const { options, runner } = await task(isolation, { source, root: temp() }, { permissionMode: 'deny' })
    expect(options.launchArgs ?? []).not.toContain('--add-dir')
    await runner.dispose?.()
  })

  it('the pool tells a runner with the skills on from one with them off', () => {
    const base = { personaId: 'nina', projectId: 'p1', purpose: 'task' as const, provider: 'claude', model: 'haiku', cwd: 'C:/x', permissionMode: 'allow-once', toolLevel: 'write' }
    expect(sessionPoolKey({ ...base, skills: true })).not.toBe(sessionPoolKey(base))
    expect(sessionPoolKey({ ...base, skills: false })).toBe(sessionPoolKey(base))
    expect(sessionPoolKey(base)).toBe('nina|p1|task|claude|haiku|C:/x|allow-once|write|')
  })
})
