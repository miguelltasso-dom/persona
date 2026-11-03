/**
 * CLI connection cards for `listConnections`: never a false `not_logged_in`.
 * First paint is `phase: 'checking'`; a 6 s auth probe must finish (timeout ≥ 8 s).
 */

import {
  detectConnections,
  toUiConnection,
  type ConnectionSnapshot,
} from '@deepseek-ai/dsh-persona-runners'
import type { ConnectionView } from './types.ts'

/** Per-CLI auth on this machine takes ~5 s; 400 ms was a false negative. */
export const CONNECTION_PROBE_TIMEOUT_MS = 8_000
/** Warm cache lifetime. */
export const CONNECTION_CACHE_MS = 60_000

const KINDS = ['dsh', 'claude', 'codex', 'opencode', 'cursor'] as const

export type ConnectionDetector = (options: {
  timeoutMs: number
  force?: boolean
}) => Promise<readonly ConnectionSnapshot[]>

/**
 * Background probe + 60 s cache. `list()` never blocks; `ready()` waits one pass.
 */
export class ConnectionProbe {
  /**
   * @param options - Timeouts, injected detector (tests), clock.
   */
  constructor(options: {
    timeoutMs?: number
    cacheMs?: number
    detect?: ConnectionDetector
    now?: () => number
  } = {}) {
    this.timeoutMs = options.timeoutMs ?? CONNECTION_PROBE_TIMEOUT_MS
    this.cacheMs = options.cacheMs ?? CONNECTION_CACHE_MS
    this.detect = options.detect ?? defaultDetect
    this.now = options.now ?? Date.now
  }

  readonly timeoutMs: number
  readonly cacheMs: number
  readonly detect: ConnectionDetector
  readonly now: () => number
  private cache: { at: number; cards: ConnectionView[] } | undefined
  private inflight: Promise<void> | undefined

  /** Drop cache and in-flight probe (tests wipe between `it`s). */
  reset(): void {
    this.cache = undefined
    this.inflight = undefined
  }

  /** Kick a probe if the cache is cold or stale. */
  warm(): void {
    void this.ensure()
  }

  /**
   * Cached cards, or `checking` placeholders (no `not_logged_in`).
   * @returns Cards for the Remote.
   */
  list(): ConnectionView[] {
    const cached = this.cache
    if (cached !== undefined && this.now() - cached.at < this.cacheMs) return cached.cards
    this.warm()
    if (cached !== undefined) return cached.cards
    return checkingPlaceholders()
  }

  /**
   * Wait for the in-flight probe (tests / first real reply).
   * @returns Cards after one finished pass, or still-checking if the probe failed.
   */
  async ready(): Promise<ConnectionView[]> {
    await this.ensure()
    return this.list()
  }

  private ensure(): Promise<void> {
    if (this.inflight !== undefined) return this.inflight
    this.inflight = this.probe().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  private async probe(): Promise<void> {
    try {
      const snaps = await this.detect({ timeoutMs: this.timeoutMs, force: true })
      this.cache = { at: this.now(), cards: snaps.map(toCard) }
    } catch {
      // Timeout/throw is not a definitive logout — keep checking / last ready cache.
    }
  }
}

function defaultDetect(options: { timeoutMs: number; force?: boolean }): Promise<ConnectionSnapshot[]> {
  if (process.env.VITEST === 'true') return Promise.resolve([])
  return detectConnections({ timeoutMs: options.timeoutMs, force: options.force === true })
}

function toCard(snap: ConnectionSnapshot): ConnectionView {
  const row = toUiConnection(snap)
  const kind = row.id === 'claude' || row.id === 'codex' || row.id === 'cursor' || row.id === 'opencode'
    ? row.id
    : 'dsh'
  const card: ConnectionView = {
    id: row.id,
    kind,
    available: row.available,
    loggedIn: row.loggedIn,
    loginHint: row.loginHint,
    phase: 'ready',
  }
  if (row.error === undefined) return card
  const { code, message } = row.error
  if (code === 'cli_not_found' || code === 'not_logged_in' || code === 'quota_exhausted') {
    return { ...card, error: { code, message } }
  }
  return card
}

function checkingPlaceholders(): ConnectionView[] {
  return KINDS.map(id => ({
    id,
    kind: id,
    available: false,
    loggedIn: false,
    loginHint: '',
    phase: 'checking' as const,
  }))
}
