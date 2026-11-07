/**
 * The DRY probes of the isolation (ISO-1, D-085): zero model call, control requests only, counts and settings values only.
 *  - {@link runIsolationProbe}: launched with the product's own arguments, does Claude come up isolated with the login intact?
 *  - {@link probeParity}: does an isolated launch apply the SAME model and effort the person's native launch applies? The CLI
 *    answers it itself (`get_settings.applied`), so nothing is guessed from settings files.
 *
 * Why parity is its own probe: `--setting-sources project` drops the person's USER settings, and with them their default model
 * and the per-model effort (`modelSettings`). Measured on this machine: native = opus at effort `xhigh`; isolated without flags =
 * opus at effort `medium`. "Zero change of model" (D-085) therefore needs `--model` AND `--effort` passed explicitly.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cliPolicyOf } from '../resolve/cli-policy.ts'
import type { ControlLaunch, ControlSession, OpenControl } from './claude-control.ts'
import { CLAUDE_ISOLATION_ARGS, CLAUDE_ISOLATION_ENV, isolationPlan, type CallKind, type CliEnvMode } from './isolation.ts'
import { settingsArgs } from './flag-settings.ts'
import { evaluateIsolationProbe, type IsolationProbeReading } from './isolation-probe.ts'

const sleep = async (ms: number): Promise<void> => new Promise<void>((done) => { setTimeout(done, ms) })

/** What the CLI says it applies. */
export interface Applied {
  readonly model?: string
  readonly effort?: string
}

function appliedOf(settings: Record<string, unknown>): Applied {
  const applied = settings.applied
  if (applied === null || typeof applied !== 'object') return {}
  const row = applied as Record<string, unknown>
  return {
    ...(typeof row.model === 'string' && row.model !== '' ? { model: row.model } : {}),
    ...(typeof row.effort === 'string' && row.effort !== '' ? { effort: row.effort } : {}),
  }
}

async function withSession<T>(open: OpenControl, launch: ControlLaunch, use: (session: ControlSession) => Promise<T>): Promise<T> {
  const session = open(launch)
  try {
    return await use(session)
  } finally {
    await session.close()
  }
}

/**
 * The model and effort a launch applies.
 * @param open - Control client.
 * @param launch - Arguments, env and cwd of the launch under test.
 */
export async function readApplied(open: OpenControl, launch: ControlLaunch): Promise<Applied> {
  return withSession(open, launch, async (session) => {
    await session.request('initialize')
    return appliedOf(await session.request('get_settings'))
  })
}

export interface ParityResult {
  /** True only when the isolated launch, with {@link extraArgs}, applies exactly what the native launch applies. */
  readonly ok: boolean
  /** Arguments to append so the isolated launch applies the native model/effort (`--model <id>` only for a `default` model). */
  readonly extraArgs: readonly string[]
  readonly native: Applied
  readonly isolated: Applied
}

/**
 * @param open - Control client.
 * @param options - `modelArg`: the model the persona is configured with (`default` = the person's own default); `cwd`.
 * @returns The explicit arguments that keep model and effort unchanged, and whether that was proven.
 */
export async function probeParity(open: OpenControl, options: { readonly modelArg: string; readonly cwd: string }): Promise<ParityResult> {
  const explicit = options.modelArg !== 'default' && options.modelArg !== ''
  const native = await readApplied(open, { args: explicit ? ['--model', options.modelArg] : [], env: {}, cwd: options.cwd })
  const extra: string[] = []
  const modelFlag = explicit ? ['--model', options.modelArg] : native.model === undefined ? [] : ['--model', native.model]
  if (!explicit && native.model !== undefined) extra.push('--model', native.model)
  const base = [...CLAUDE_ISOLATION_ARGS, ...modelFlag]
  let isolated = await readApplied(open, { args: base, env: { ...CLAUDE_ISOLATION_ENV }, cwd: options.cwd })
  if (native.effort !== undefined && isolated.effort !== native.effort) {
    extra.push('--effort', native.effort)
    isolated = await readApplied(open, { args: [...base, '--effort', native.effort], env: { ...CLAUDE_ISOLATION_ENV }, cwd: options.cwd })
  }
  const ok = native.model !== undefined && isolated.model === native.model && (native.effort === undefined || isolated.effort === native.effort)
  return { ok, extraArgs: extra, native, isolated }
}

/** The account connectors arrive ASYNCHRONOUSLY after `initialize` (1–3 s): wait for them before counting, then look once more. */
async function settledServers(session: ControlSession, arriveMs: number, pauseMs: number): Promise<number> {
  const started = Date.now()
  let servers: unknown[] = []
  while (Date.now() - started < arriveMs) {
    const status = await session.request('mcp_status')
    servers = Array.isArray(status.mcpServers) ? status.mcpServers : []
    const pendingNow = servers.some(row => typeof row === 'object' && row !== null && (row as { status?: unknown }).status === 'pending')
    if (servers.length > 0 && !pendingNow) break
    await sleep(400)
  }
  // A late arrival would be the fail-open case.
  await sleep(pauseMs)
  const again = await session.request('mcp_status')
  return Array.isArray(again.mcpServers) ? again.mcpServers.length : servers.length
}

export interface IsolationRunRow {
  readonly call: CallKind
  readonly reading: IsolationProbeReading
  /** Size of the context the FIRST request of this launch carries. */
  readonly openingContextTokens: number | null
  readonly ok: boolean
  readonly failures: readonly string[]
}

export interface IsolationRun {
  readonly ok: boolean
  readonly rows: readonly IsolationRunRow[]
}

/**
 * Launch Claude exactly as the product would in `mode` and read what it came up with.
 * @param open - Control client.
 * @param options - `mode`: which mode's plan to prove; `calls`: which kinds of call; `cwd`; `arriveMs`/`pauseMs`: how long to wait for connectors.
 * @returns Per-call readings and the verdict (counts only).
 */
export async function runIsolationProbe(
  open: OpenControl,
  options: { readonly mode: CliEnvMode; readonly calls: readonly CallKind[]; readonly cwd: string; readonly arriveMs?: number; readonly pauseMs?: number },
): Promise<IsolationRun> {
  const rows: IsolationRunRow[] = []
  for (const call of options.calls) {
    const plan = isolationPlan('claude', { env: { PERSONA_CLI_ENV: options.mode }, call })
    const vendor = cliPolicyOf('claude', call === 'task' ? { files: 'write' } : {}, call === 'task' ? 'allow-once' : 'deny')
    const row = await withSession(open, { args: [...vendor.launchArgs, ...plan.launchArgs], env: plan.env, cwd: options.cwd }, async (session) => {
      const init = await session.request('initialize')
      const mcpServers = await settledServers(session, options.arriveMs ?? 8000, options.pauseMs ?? 3000)
      const usage = await session.request('get_context_usage', { detail: 'summary' })
      const categories = Array.isArray(usage.categories) ? usage.categories as { name?: unknown; tokens?: unknown }[] : []
      const builtinToolTokens = categories
        .filter(item => typeof item.name === 'string' && item.name.startsWith('System tools'))
        .reduce((total, item) => total + (typeof item.tokens === 'number' ? item.tokens : 0), 0)
      const reading: IsolationProbeReading = {
        loggedIn: init.account !== null && typeof init.account === 'object',
        mcpServers,
        commands: Array.isArray(init.commands) ? init.commands.length : 0,
        builtinToolTokens,
      }
      const verdict = evaluateIsolationProbe(reading, { noBuiltinTools: call === 'answer' })
      return {
        call, reading, ok: verdict.ok, failures: verdict.failures,
        openingContextTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : null,
      } satisfies IsolationRunRow
    })
    rows.push(row)
  }
  return { ok: rows.length > 0 && rows.every(row => row.ok), rows }
}

/** An empty working directory for a probe (the CLI reads the cwd's own config, which must not colour the result). */
export function probeCwd(): { readonly dir: string; readonly dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'persona-iso-probe-'))
  return { dir, dispose: () => { try { rmSync(dir, { recursive: true, force: true }) } catch (error) { void error } } }
}

export interface ConnectorProbe {
  /** True only when the allow-list loaded EXACTLY that connector, connected, with the login intact. */
  readonly ok: boolean
  readonly status: 'connected' | 'needs-auth' | 'failed' | 'absent' | 'many' | 'no-login'
  /** Tokens this connector adds to the opening context of every call, measured against the floor (nothing loaded). */
  readonly extraTokens?: number
  /** `extraTokens` as a fraction of the floor (0.046 = +4.6%). */
  readonly percent?: number
  readonly basisTokens?: number
}

/** Settled MCP server entries (the connectors of the account arrive 1–3 s after `initialize`). */
async function settledEntries(session: ControlSession, arriveMs: number, pauseMs: number): Promise<{ status?: unknown }[]> {
  const started = Date.now()
  let servers: unknown[] = []
  while (Date.now() - started < arriveMs) {
    const status = await session.request('mcp_status')
    servers = Array.isArray(status.mcpServers) ? status.mcpServers : []
    const pendingNow = servers.some(row => typeof row === 'object' && row !== null && (row as { status?: unknown }).status === 'pending')
    if (servers.length > 0 && !pendingNow) break
    await sleep(400)
  }
  await sleep(pauseMs)
  const again = await session.request('mcp_status')
  return (Array.isArray(again.mcpServers) ? again.mcpServers : servers).filter((row): row is { status?: unknown } => typeof row === 'object' && row !== null)
}

/**
 * ISO-5 pre-flight (control requests only, zero model): launch exactly as a task that needs this connector would, and check that the
 * allow-list loaded that connector and nothing else; measure what it costs per call against the floor. The same probe is what the screen
 * shows before the person confirms ("a Nina vai gastar ~+X% por chamada") and what decides, per CLI version, whether the connector is
 * usable at all (otherwise the call stays at the floor and the screen says the connector is unavailable).
 * @param open - Control client.
 * @param options - `url`: the connector's proxy URL; `cwd`; waits for the connectors to arrive.
 */
export async function probeConnector(
  open: OpenControl,
  options: { readonly url: string; readonly cwd: string; readonly arriveMs?: number; readonly pauseMs?: number },
): Promise<ConnectorProbe> {
  const vendor = cliPolicyOf('claude', { files: 'write' }, 'allow-once')
  const env = { PERSONA_CLI_ENV: 'needed' }
  const floor = isolationPlan('claude', { env, call: 'task' })
  const loaded = isolationPlan('claude', { env, call: 'task', accountConnectors: [options.url] })
  const arriveMs = options.arriveMs ?? 8000
  const pauseMs = options.pauseMs ?? 3000
  const basis = await withSession(open, { args: [...vendor.launchArgs, ...floor.launchArgs], env: floor.env, cwd: options.cwd }, async (session) => {
    await session.request('initialize')
    const usage = await session.request('get_context_usage', { detail: 'summary' })
    return typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined
  })
  return withSession(open, { args: [...vendor.launchArgs, ...loaded.launchArgs, ...settingsArgs(loaded.settings)], env: loaded.env, cwd: options.cwd }, async (session) => {
    const init = await session.request('initialize')
    if (init.account === null || typeof init.account !== 'object') return { ok: false, status: 'no-login' } satisfies ConnectorProbe
    const servers = await settledEntries(session, arriveMs, pauseMs)
    if (servers.length === 0) return { ok: false, status: 'absent' } satisfies ConnectorProbe
    if (servers.length > 1) return { ok: false, status: 'many' } satisfies ConnectorProbe
    const status = servers[0]?.status
    if (status === 'needs-auth') return { ok: false, status: 'needs-auth' } satisfies ConnectorProbe
    if (status !== 'connected') return { ok: false, status: 'failed' } satisfies ConnectorProbe
    const usage = await session.request('get_context_usage', { detail: 'summary' })
    const total = typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined
    if (total === undefined || basis === undefined || basis <= 0) return { ok: true, status: 'connected' } satisfies ConnectorProbe
    const extra = Math.max(0, total - basis)
    return { ok: true, status: 'connected', extraTokens: extra, percent: Math.round((extra / basis) * 1000) / 1000, basisTokens: basis } satisfies ConnectorProbe
  })
}

export interface SkillsProbe {
  /** True only when the folder added the person's skills and NOTHING else (no settings, no MCP, same model and effort). */
  readonly ok: boolean
  readonly status: 'loaded' | 'none' | 'leaks-settings' | 'no-login'
  /** Commands (skills) the folder adds on top of the CLI's built-in ones. */
  readonly extraCommands?: number
  /** Opening context of the launch with the folder and of the same launch without it (control request, zero model). */
  readonly openingTokens?: number
  readonly baselineTokens?: number
}

interface SkillsReading {
  readonly loggedIn: boolean
  readonly commands: number
  readonly mcpServers: number
  readonly applied: Applied
  readonly tokens?: number
}

async function readSkills(open: OpenControl, launch: ControlLaunch): Promise<SkillsReading> {
  return withSession(open, launch, async (session) => {
    const init = await session.request('initialize')
    const settings = await session.request('get_settings')
    const mcp = await session.request('mcp_status')
    const usage = await session.request('get_context_usage', { detail: 'summary' })
    const applied = (typeof settings.applied === 'object' && settings.applied !== null ? settings.applied : {}) as { model?: unknown; effort?: unknown }
    return {
      loggedIn: init.account !== null && typeof init.account === 'object',
      commands: Array.isArray(init.commands) ? init.commands.length : 0,
      mcpServers: Array.isArray(mcp.mcpServers) ? mcp.mcpServers.length : 0,
      applied: {
        ...(typeof applied.model === 'string' ? { model: applied.model } : {}),
        ...(typeof applied.effort === 'string' ? { effort: applied.effort } : {}),
      },
      ...(typeof usage.totalTokens === 'number' ? { tokens: usage.totalTokens } : {}),
    }
  })
}

/**
 * HT-11 pre-flight (control requests only, zero model): launch like a task with the person's skills folder and like the same task without it,
 * and check that the folder brought skills and nothing else. The user setting source is NEVER in play (it carries the person's permission
 * allow-list, model and effort), so any change of model/effort or any MCP server means the CLI started honouring more than the folder: not ok.
 * @param open - Control client.
 * @param options - `root`: the product's folder of pointers; `cwd`.
 */
export async function probeSkills(open: OpenControl, options: { readonly root: string; readonly cwd: string }): Promise<SkillsProbe> {
  const vendor = cliPolicyOf('claude', { files: 'write' }, 'allow-once')
  const env = { PERSONA_CLI_ENV: 'needed' }
  const withSkills = isolationPlan('claude', { env, call: 'task', personalSkills: options.root })
  const without = withSkills
  const baseArgs = without.launchArgs.filter((arg, at, all) => arg !== '--add-dir' && all[at - 1] !== '--add-dir')
  const loaded = await readSkills(open, { args: [...vendor.launchArgs, ...withSkills.launchArgs], env: withSkills.env, cwd: options.cwd })
  if (!loaded.loggedIn) return { ok: false, status: 'no-login' }
  const base = await readSkills(open, { args: [...vendor.launchArgs, ...baseArgs], env: without.env, cwd: options.cwd })
  const same = loaded.applied.model === base.applied.model && loaded.applied.effort === base.applied.effort && loaded.mcpServers === base.mcpServers && loaded.mcpServers === 0
  if (!same) return { ok: false, status: 'leaks-settings' }
  const extra = loaded.commands - base.commands
  if (extra <= 0) return { ok: false, status: 'none' }
  return {
    ok: true, status: 'loaded', extraCommands: extra,
    ...(loaded.tokens === undefined ? {} : { openingTokens: loaded.tokens }),
    ...(base.tokens === undefined ? {} : { baselineTokens: base.tokens }),
  }
}
