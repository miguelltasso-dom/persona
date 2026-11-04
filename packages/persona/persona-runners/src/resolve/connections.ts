/**
 * Read-only connection cards for Anvil Remote `listConnections`.
 * No secrets. 60 s cache. Short per-CLI timeout.
 */

import type { Runtime } from '@botiverse/oar'
import type { CliKind } from '../contract.ts'
import { detectLocalProviders, LOCAL_LABEL } from '../dsh/local.ts'
import { loginHintFor, RunnerResolveError } from './errors.ts'
import { rememberAuth, rememberModels, resetProbeCache } from './probe-cache.ts'
import { readOarAccountUsage, type OfficialQuota } from '@deepseek-ai/dsh-persona-usage'
import {
  asProbe,
  probeCliBinary,
  PROBE_TIMEOUT_MS,
  quotaExhausted,
  withTimeout,
  type ProbeRuntime,
} from './probe.ts'

export type ConnectionKind = CliKind | 'dsh' | 'ollama' | 'lmstudio'

export interface ConnectionSnapshot {
  id: ConnectionKind
  kind: 'dsh' | 'cli' | 'local'
  installed: boolean
  loggedIn: boolean
  models: readonly string[]
  version?: string
  usageOrigin?: 'official' | 'unavailable'
  /** Official windows for Anvil `putQuota` / Lumen pool. Never `default`. */
  officialQuota?: OfficialQuota
  loginHint?: string
  /** Shown on local cards — never a price. */
  costLabel?: string
  /** Auth probe timed out or threw — not a definitive logout. */
  authUnknown?: boolean
  error?: { code: 'cli_not_found' | 'not_logged_in' | 'quota_exhausted'; message: string }
}

export interface DetectConnectionsOptions {
  timeoutMs?: number
  cacheMs?: number
  now?: () => number
  force?: boolean
  runtimes?: Partial<Record<CliKind, Runtime | ProbeRuntime>>
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
  ollama?: string
  lmstudio?: string
}

const CACHE_MS = 60_000
/** First logged-in CLI the host may bind without a login wall. Claude then Codex. */
const CONNECTED_ORDER: readonly CliKind[] = ['claude', 'codex', 'opencode', 'cursor']
const CLI_BINS: Record<CliKind, string> = {
  claude: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  cursor: 'cursor-agent',
}

let cache: { at: number; value: ConnectionSnapshot[] } | undefined

function redact(value: ConnectionSnapshot): ConnectionSnapshot {
  const blob = JSON.stringify(value)
  if (/\b(?:sk-|tok-|key-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/u.test(blob) || blob.includes('@')) {
    return {
      id: value.id,
      kind: value.kind,
      installed: value.installed,
      loggedIn: value.loggedIn,
      models: value.models,
      ...(value.usageOrigin === undefined ? {} : { usageOrigin: value.usageOrigin }),
      ...(value.officialQuota === undefined ? {} : { officialQuota: value.officialQuota }),
    }
  }
  return value
}

async function probeDsh(env: NodeJS.ProcessEnv): Promise<ConnectionSnapshot> {
  const loggedIn = typeof env.DEEPSEEK_API_KEY === 'string' && env.DEEPSEEK_API_KEY.length > 0
  const card: ConnectionSnapshot = {
    id: 'dsh',
    kind: 'dsh',
    installed: true,
    loggedIn,
    models: ['default'],
    version: process.version,
  }
  if (!loggedIn) card.loginHint = loginHintFor('dsh')
  return redact(card)
}

async function probeCli(
  id: CliKind,
  runtime: Runtime | ProbeRuntime | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<ConnectionSnapshot> {
  const binary = runtime === undefined ? await probeCliBinary(CLI_BINS[id], env) : { ok: true, version: undefined as string | undefined }
  const card: ConnectionSnapshot = {
    id,
    kind: 'cli',
    installed: binary.ok,
    loggedIn: false,
    models: [],
  }
  if (binary.version !== undefined) card.version = binary.version
  if (runtime === undefined) {
    if (!binary.ok) {
      card.error = { code: 'cli_not_found', message: new RunnerResolveError('cli_not_found', id).message }
      card.loginHint = loginHintFor(id)
      return redact(card)
    }
    card.loginHint = loginHintFor(id)
    return redact(card)
  }
  const probe = asProbe(runtime)
  try {
    const snap = probe.installation === undefined
      ? { kind: 'available', version: binary.version }
      : await withTimeout(timeoutMs, probe.installation())
    card.installed = snap.kind === 'available' || binary.ok
    if (typeof snap.version === 'string' && snap.version.length > 0) card.version = snap.version
    if (snap.kind !== 'available' && !binary.ok) {
      card.error = { code: 'cli_not_found', message: new RunnerResolveError('cli_not_found', id).message }
      card.loginHint = loginHintFor(id)
      return redact(card)
    }
    if (probe.authStatus !== undefined && snap.kind === 'available') {
      try {
        const auth = await withTimeout(timeoutMs, probe.authStatus(snap as never, { timeoutMs }))
        rememberAuth(id, auth.kind)
        card.loggedIn = auth.kind === 'logged_in'
        if (auth.kind === 'logged_out' || auth.kind === 'unauthenticated') {
          card.error = { code: 'not_logged_in', message: new RunnerResolveError('not_logged_in', id).message }
        }
      } catch {
        card.authUnknown = true
      }
    } else if (id === 'opencode') {
      card.loggedIn = card.installed
    }
    if (probe.listModels !== undefined && card.installed) {
      const listed = await withTimeout(timeoutMs, probe.listModels(snap as never, { timeoutMs }))
      card.models = (listed.models ?? [])
        .map(item => item.id)
        .filter((model): model is string => typeof model === 'string')
        .slice(0, 32)
      rememberModels(id, '', card.models)
    }
    if (probe.accountUsage !== undefined && card.loggedIn) {
      let usage: unknown
      try {
        usage = await withTimeout(timeoutMs, probe.accountUsage(snap as never))
      } catch {
        card.usageOrigin = 'unavailable'
        card.officialQuota = {
          provider: id, origin: 'unavailable', windows: [], detail: 'accountUsage timeout',
        }
        return redact(card)
      }
      const quota = readOarAccountUsage(id, usage)
      card.officialQuota = quota
      card.usageOrigin = quota.origin === 'official' ? 'official' : 'unavailable'
      if (quotaExhausted(usage) || quota.windows.some(window => (window.usedPercent ?? 0) >= 100)) {
        card.error = { code: 'quota_exhausted', message: new RunnerResolveError('quota_exhausted', id).message }
      }
    }
  } catch {
    if (!card.installed) {
      card.error = { code: 'cli_not_found', message: new RunnerResolveError('cli_not_found', id).message }
    } else {
      card.authUnknown = true
    }
  }
  if (!card.loggedIn && card.authUnknown !== true) card.loginHint = loginHintFor(id)
  return redact(card)
}

async function defaultRuntime(cli: CliKind): Promise<Runtime | undefined> {
  try {
    const oar = await import('@botiverse/oar')
    if (cli === 'cursor') {
      const registry = oar.createRuntimeRegistry([
        ...oar.defaultRuntimes.list(),
        oar.createCursorRuntime({ sdk: () => import('@cursor/sdk') }),
      ])
      return registry.get('cursor')
    }
    return oar.defaultRuntimes.get(cli)
  } catch {
    return undefined
  }
}

/**
 * List dsh + four CLIs. Cached 60 s. Never returns tokens or emails.
 * @param options - Timeouts, cache, injected runtimes (tests / fake-cli).
 */
export async function detectConnections(options: DetectConnectionsOptions = {}): Promise<ConnectionSnapshot[]> {
  const now = options.now ?? Date.now
  const cacheMs = options.cacheMs ?? CACHE_MS
  if (options.force !== true && cache !== undefined && now() - cache.at < cacheMs) return cache.value
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
  const env = options.env ?? process.env
  const cards: ConnectionSnapshot[] = [await probeDsh(env)]
  for (const id of ['claude', 'codex', 'opencode', 'cursor'] as const) {
    const runtime = options.runtimes === undefined ? await defaultRuntime(id) : options.runtimes[id]
    cards.push(await probeCli(id, runtime, timeoutMs, env))
  }
  const locals = await detectLocalProviders({
    timeoutMs: Math.min(timeoutMs, 400),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.ollama === undefined ? {} : { ollama: options.ollama }),
    ...(options.lmstudio === undefined ? {} : { lmstudio: options.lmstudio }),
  })
  for (const local of locals) {
    cards.push({
      id: local.id,
      kind: 'local',
      installed: local.installed,
      loggedIn: local.installed,
      models: local.models,
      costLabel: LOCAL_LABEL,
      loginHint: LOCAL_LABEL,
    })
  }
  cache = { at: now(), value: cards }
  return cards
}

/**
 * Prefer a logged-in Claude or Codex. No UI, no prompt, no dsh/local.
 * @param cards - {@link detectConnections} snapshots.
 * @returns CLI id, or `undefined` when nobody is logged in.
 */
export function pickConnectedCli(cards: readonly ConnectionSnapshot[]): CliKind | undefined {
  for (const id of CONNECTED_ORDER) {
    const card = cards.find(row => row.id === id)
    if (card?.loggedIn === true && card.authUnknown !== true) return id
  }
  return undefined
}

/** Drop the 60 s cache (tests). */
export function resetConnectionCache(): void {
  cache = undefined
  resetProbeCache()
}

/** UI row: typed error + loginHint, never a stack. */
export interface ConnectionUiRow {
  readonly id: ConnectionKind
  readonly available: boolean
  readonly loggedIn: boolean
  readonly loginHint: string
  readonly error?: { readonly code: string; readonly message: string }
}

/**
 * Map a probe card to the payload the UI may render as-is.
 * @param snap - detectConnections card.
 */
export function toUiConnection(snap: ConnectionSnapshot): ConnectionUiRow {
  const loginHint = snap.loginHint
    ?? (snap.loggedIn || snap.authUnknown === true ? '' : loginHintFor(snap.id))
  const row: ConnectionUiRow = {
    id: snap.id,
    available: snap.installed,
    loggedIn: snap.loggedIn,
    loginHint,
  }
  if (snap.kind === 'local') {
    return { ...row, loginHint: snap.costLabel ?? LOCAL_LABEL }
  }
  if (snap.error !== undefined) return { ...row, error: snap.error }
  if (snap.authUnknown === true) return row
  if (!snap.loggedIn) {
    return { ...row, error: { code: 'not_logged_in', message: loginHint } }
  }
  return row
}
