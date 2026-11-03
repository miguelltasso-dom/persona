/**
 * Read-only connection cards for Anvil Remote `listConnections`.
 * No secrets. 60 s cache. Short per-CLI timeout.
 */

import type { Runtime } from '@botiverse/oar'
import type { CliKind } from '../contract.ts'
import { loginHintFor } from './errors.ts'
import {
  asProbe,
  probeCliBinary,
  PROBE_TIMEOUT_MS,
  quotaExhausted,
  withTimeout,
  type ProbeRuntime,
} from './probe.ts'

export type ConnectionKind = CliKind | 'dsh'

export interface ConnectionSnapshot {
  id: ConnectionKind
  kind: 'dsh' | 'cli'
  installed: boolean
  loggedIn: boolean
  models: readonly string[]
  version?: string
  usageOrigin?: 'official' | 'unavailable'
  loginHint?: string
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
}

const CACHE_MS = 60_000
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
  const binary = runtime === undefined ? probeCliBinary(CLI_BINS[id], env) : { ok: true, version: undefined as string | undefined }
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
      card.error = { code: 'cli_not_found', message: `CLI ${id} não encontrada neste computador.` }
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
      card.error = { code: 'cli_not_found', message: `CLI ${id} não encontrada neste computador.` }
      card.loginHint = loginHintFor(id)
      return redact(card)
    }
    if (probe.authStatus !== undefined && snap.kind === 'available') {
      try {
        const auth = await withTimeout(timeoutMs, probe.authStatus(snap as never, { timeoutMs }))
        card.loggedIn = auth.kind === 'logged_in'
        if (auth.kind === 'logged_out' || auth.kind === 'unauthenticated') {
          card.error = { code: 'not_logged_in', message: `CLI ${id} não está logada. ${loginHintFor(id)}` }
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
    }
    if (probe.accountUsage !== undefined && card.loggedIn) {
      const usage = await withTimeout(timeoutMs, probe.accountUsage(snap as never))
      card.usageOrigin = quotaExhausted(usage) ? 'official' : 'unavailable'
      if (quotaExhausted(usage)) {
        card.error = { code: 'quota_exhausted', message: `Cota de ${id} esgotada. Espere a janela resetar.` }
      }
    }
  } catch {
    if (!card.installed) {
      card.error = { code: 'cli_not_found', message: `CLI ${id} não encontrada neste computador.` }
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
  cache = { at: now(), value: cards }
  return cards
}

/** Drop the 60 s cache (tests). */
export function resetConnectionCache(): void {
  cache = undefined
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
  if (snap.error !== undefined) return { ...row, error: snap.error }
  if (snap.authUnknown === true) return row
  if (!snap.loggedIn) {
    return { ...row, error: { code: 'not_logged_in', message: loginHint } }
  }
  return row
}
