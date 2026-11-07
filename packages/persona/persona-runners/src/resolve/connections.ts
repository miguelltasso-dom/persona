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
  quotaExhausted,
  withTimeout,
  type ProbeRuntime,
} from './probe.ts'

export type ConnectionKind = CliKind | 'dsh' | 'ollama' | 'lmstudio'

/**
 * EFF-1 (D-088): one model the ENGINE offers, with the reasoning-effort levels IT accepts for that model. The screen builds its menu
 * from this (never a hard-coded model or level). `efforts` absent = the engine exposes none for this model: no effort choice.
 */
export interface ModelMenuEntry {
  id: string
  label?: string
  efforts?: readonly string[]
  defaultEffort?: string
  /** The engine lists the model but refuses to run it as it is. */
  disabled?: boolean
}

export interface ConnectionSnapshot {
  id: ConnectionKind
  kind: 'dsh' | 'cli' | 'local'
  installed: boolean
  loggedIn: boolean
  models: readonly string[]
  /** EFF-1: the same models with what the engine says about each (name, effort menu). Absent when the engine said nothing more than ids. */
  modelMenu?: readonly ModelMenuEntry[]
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
  /** Total deadline per CLI, including installation, auth, models and quota; defaults to 2000 ms. */
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

let cache: { kind: 'ready'; at: number; value: ConnectionSnapshot[] }
  | { kind: 'checking'; options: DetectConnectionsOptions; promise: Promise<ConnectionSnapshot[]> }
  | undefined

function redact(value: ConnectionSnapshot): ConnectionSnapshot {
  const blob = JSON.stringify(value)
  if (/\b(?:sk-|tok-|key-|Bearer\s+)[A-Za-z0-9._-]{8,}\b/u.test(blob) || blob.includes('@')) {
    return {
      id: value.id,
      kind: value.kind,
      installed: value.installed,
      loggedIn: value.loggedIn,
      models: value.models,
      ...(value.authUnknown === undefined ? {} : { authUnknown: value.authUnknown }),
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
  const deadline = Date.now() + timeoutMs
  const remaining = (): number => Math.max(1, deadline - Date.now())
  const binary: { ok: boolean; version?: string; timedOut?: boolean } = runtime === undefined
    ? await probeCliBinary(CLI_BINS[id], env, remaining()) : { ok: false }
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
      if (binary.timedOut === true) return { ...card, authUnknown: true }
      card.error = { code: 'cli_not_found', message: new RunnerResolveError('cli_not_found', id).message }
      card.loginHint = loginHintFor(id)
      return redact(card)
    }
    card.authUnknown = true
    return redact(card)
  }
  const probe = asProbe(runtime)
  try {
    const snap = probe.installation === undefined
      ? { kind: 'available', version: binary.version }
      : await withTimeout(remaining(), probe.installation())
    card.installed = snap.kind === 'available'
    if (typeof snap.version === 'string' && snap.version.length > 0) card.version = snap.version
    if (snap.kind !== 'available') {
      card.error = { code: 'cli_not_found', message: new RunnerResolveError('cli_not_found', id).message }
      card.loginHint = loginHintFor(id)
      return redact(card)
    }
    if (probe.authStatus !== undefined && snap.kind === 'available') {
      try {
        const auth = await withTimeout(remaining(), probe.authStatus(snap as never, { timeoutMs: remaining() }))
        rememberAuth(id, auth.kind)
        card.loggedIn = auth.kind === 'logged_in'
        if (auth.kind === 'logged_out' || auth.kind === 'unauthenticated') {
          card.error = { code: 'not_logged_in', message: new RunnerResolveError('not_logged_in', id).message }
        } else if (auth.kind !== 'logged_in') {
          card.authUnknown = true
        }
      } catch (error) {
        // Authentication failure leaves the host in checking, never logged out.
        void error
        card.authUnknown = true
      }
    } else {
      card.authUnknown = true
    }
    const models = async (): Promise<void> => {
      if (probe.listModels === undefined || Date.now() >= deadline) return
      const listed = await withTimeout(remaining(), probe.listModels(snap as never, { timeoutMs: remaining() }))
      card.models = (listed.models ?? [])
        .map(item => item.id)
        .filter((model): model is string => typeof model === 'string')
        .slice(0, 32)
      const menu: ModelMenuEntry[] = []
      for (const item of listed.models ?? []) {
        if (typeof item.id !== 'string' || menu.length >= 32) continue
        menu.push({
          id: item.id,
          ...(typeof item.displayName === 'string' && item.displayName !== '' ? { label: item.displayName } : {}),
          ...(Array.isArray(item.effortLevels) && item.effortLevels.length > 0 ? { efforts: item.effortLevels.filter((level): level is string => typeof level === 'string') } : {}),
          ...(typeof item.defaultEffort === 'string' && item.defaultEffort !== '' ? { defaultEffort: item.defaultEffort } : {}),
          ...(item.disabled === undefined ? {} : { disabled: true }),
        })
      }
      if (menu.some(entry => entry.label !== undefined || entry.efforts !== undefined)) card.modelMenu = menu
      rememberModels(id, '', card.models)
    }
    const quota = async (): Promise<void> => {
      if (probe.accountUsage === undefined || !card.loggedIn) return
      let usage: unknown
      try {
        if (Date.now() >= deadline) throw new Error('probe timeout')
        usage = await withTimeout(remaining(), probe.accountUsage(snap as never))
      } catch (error) {
        // Quota is optional; preserve the confirmed installation and login.
        void error
        card.usageOrigin = 'unavailable'
        card.officialQuota = {
          provider: id, origin: 'unavailable', windows: [], detail: 'accountUsage timeout',
        }
        return
      }
      const quota = readOarAccountUsage(id, usage)
      card.officialQuota = quota
      card.usageOrigin = quota.origin === 'official' ? 'official' : 'unavailable'
      if (quotaExhausted(usage) || quota.windows.some(window => (window.usedPercent ?? 0) >= 100)) {
        card.error = { code: 'quota_exhausted', message: new RunnerResolveError('quota_exhausted', id).message }
      }
    }
    // Model discovery cannot turn a confirmed login into an unknown one.
    await Promise.allSettled([models(), quota()])
  } catch (error) {
    // Installation failure is unknown; only an explicit absence is cli_not_found.
    void error
    card.authUnknown = true
  }
  if (!card.loggedIn && card.authUnknown !== true) card.loginHint = loginHintFor(id)
  return redact(card)
}

async function defaultRuntime(cli: CliKind): Promise<Runtime | undefined> {
  try {
    switch (cli) {
      case 'claude': return (await import('@botiverse/oar/runtimes/claude')).claudeRuntime
      case 'codex': return (await import('@botiverse/oar/runtimes/codex')).codexRuntime
      case 'opencode': return (await import('@botiverse/oar/runtimes/opencode')).opencodeRuntime
      case 'cursor': return (await import('@botiverse/oar/runtimes/cursor')).createCursorRuntime({ sdk: () => import('@cursor/sdk') })
    }
  } catch {
    return undefined
  }
}

/**
 * List connections in parallel with one deadline per CLI. Cache 60 s and share an in-flight pass.
 * Installation/auth timeouts remain unknown; model/quota failures preserve confirmed login.
 * @param options - Timeouts, cache, injected runtimes (tests / fake-cli).
 * @returns Read-only connection observations without tokens or emails.
 */
export async function detectConnections(options: DetectConnectionsOptions = {}): Promise<ConnectionSnapshot[]> {
  const now = options.now ?? Date.now
  const cacheMs = options.cacheMs ?? CACHE_MS
  if (cache?.kind === 'checking' && cache.options.runtimes === options.runtimes
    && cache.options.env === options.env && cache.options.fetch === options.fetch
    && cache.options.ollama === options.ollama && cache.options.lmstudio === options.lmstudio
    && cache.options.timeoutMs === options.timeoutMs) return cache.promise
  if (options.force !== true && cache?.kind === 'ready' && now() - cache.at < cacheMs) return cache.value
  const pending = { kind: 'checking' as const, options, promise: readConnections(options) }
  cache = pending
  try {
    const cards = await pending.promise
    if (cache === pending) cache = { kind: 'ready', at: now(), value: cards }
    return cards
  } catch (error) {
    if (cache === pending) cache = undefined
    throw error
  }
}

async function readConnections(options: DetectConnectionsOptions): Promise<ConnectionSnapshot[]> {
  const timeoutMs = options.timeoutMs ?? 2_000
  const env = options.env ?? process.env
  const cliCards = (['claude', 'codex', 'opencode', 'cursor'] as const).map(async (id) => {
    try {
      const runtime = options.runtimes === undefined ? await withTimeout(timeoutMs, defaultRuntime(id)) : options.runtimes[id]
      return await probeCli(id, runtime, timeoutMs, env)
    } catch (error) {
      void error
      return { id, kind: 'cli' as const, installed: false, loggedIn: false, models: [], authUnknown: true }
    }
  })
  const localCards = detectLocalProviders({
    timeoutMs: Math.min(timeoutMs, 400),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.ollama === undefined ? {} : { ollama: options.ollama }),
    ...(options.lmstudio === undefined ? {} : { lmstudio: options.lmstudio }),
  })
  const cards: ConnectionSnapshot[] = [await probeDsh(env), ...await Promise.all(cliCards)]
  const locals = await localCards
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
