/**
 * CLI connection cards for `listConnections`: never a false `not_logged_in`.
 * First paint is `phase: 'checking'`; a 6 s auth probe must finish (timeout ≥ 8 s).
 */

import {
  detectConnections,
  toUiConnection,
  type ConnectionSnapshot,
} from '@deepseek-ai/dsh-persona-runners'
import { readClaudeMenu, STATIC_CLAUDE_MENU, type EngineMenu, type MenuSource } from './claude-menu.ts'
import { engineModelsOf } from './engine-menu.ts'
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
   * @param options - Timeouts, injected detector (tests), clock, quota persist.
   */
  constructor(options: {
    timeoutMs?: number
    cacheMs?: number
    detect?: ConnectionDetector
    now?: () => number
    persistQuota?: ((snaps: readonly ConnectionSnapshot[]) => void) | undefined
    onReady?: ((cards: readonly ConnectionView[]) => void) | undefined
    /** EFF-1: the installed Claude's own menu of models and effort levels (control request, no model). Tests inject it. */
    claudeMenu?: (() => Promise<EngineMenu>) | undefined
  } = {}) {
    this.timeoutMs = options.timeoutMs ?? CONNECTION_PROBE_TIMEOUT_MS
    this.cacheMs = options.cacheMs ?? CONNECTION_CACHE_MS
    this.detect = options.detect ?? defaultDetect
    this.now = options.now ?? Date.now
    this.persistQuota = options.persistQuota
    this.onReady = options.onReady
    this.claudeMenu = options.claudeMenu ?? (() => (process.env.VITEST === 'true' ? Promise.resolve({ entries: STATIC_CLAUDE_MENU, source: 'static' as const }) : readClaudeMenu()))
  }

  readonly timeoutMs: number
  readonly cacheMs: number
  readonly detect: ConnectionDetector
  readonly now: () => number
  readonly persistQuota: ((snaps: readonly ConnectionSnapshot[]) => void) | undefined
  readonly onReady: ((cards: readonly ConnectionView[]) => void) | undefined
  readonly claudeMenu: () => Promise<EngineMenu>
  /** The menu read from the CLI, per installed version: asked once (a static answer is asked again next pass). */
  private readonly menus = new Map<string, EngineMenu>()
  private readonly sources = new Map<string, MenuSource>()
  private cache: { at: number; cards: ConnectionView[] } | undefined
  private inflight: Promise<void> | undefined
  private lastSnaps: readonly ConnectionSnapshot[] = []

  /** Last finished `detectConnections` cards (may carry `officialQuota`). */
  snaps(): readonly ConnectionSnapshot[] {
    return this.lastSnaps
  }

  /** Drop cache and in-flight probe (tests wipe between `it`s). */
  reset(): void {
    this.cache = undefined
    this.inflight = undefined
    this.lastSnaps = []
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

  /** @returns Where each engine's menu of models came from (`cli` = the engine said it, `static` = our table): for the diagnostics and the tests, not for a screen. */
  menuSources(): Record<string, MenuSource> {
    return Object.fromEntries(this.sources)
  }

  /**
   * EFF-1: Claude's detection carries no menu of models and effort levels; its own `initialize` does. Fill it once per version (the CLI's, or the static table
   * when the CLI does not answer). A snapshot that already carries a menu (Codex) is left exactly as it came.
   */
  private async withMenu(snap: ConnectionSnapshot): Promise<ConnectionSnapshot> {
    if (snap.id !== 'claude' || !snap.installed || snap.models.length > 0 || snap.modelMenu !== undefined) return snap
    const key = snap.version ?? ''
    let menu = this.menus.get(key)
    if (menu === undefined) {
      menu = await this.claudeMenu()
      if (menu.source === 'cli') this.menus.set(key, menu)
    }
    this.sources.set(snap.id, menu.source)
    const modelMenu = menu.entries.map(entry => ({
      id: entry.id,
      ...(entry.label === undefined ? {} : { label: entry.label }),
      ...(entry.efforts === undefined ? {} : { efforts: entry.efforts }),
      ...(entry.defaultEffort === undefined ? {} : { defaultEffort: entry.defaultEffort }),
      ...(entry.disabled === true ? { disabled: true } : {}),
    }))
    return { ...snap, models: modelMenu.map(entry => entry.id), modelMenu }
  }

  private async probe(): Promise<void> {
    try {
      const detected = await this.detect({ timeoutMs: this.timeoutMs, force: true })
      const snaps = await Promise.all(detected.map(snap => this.withMenu(snap)))
      this.lastSnaps = snaps
      this.cache = { at: this.now(), cards: snaps.map(snap => toCard(snap, this.sources.get(snap.id))) }
      this.persistQuota?.(snaps)
      this.onReady?.(this.cache.cards)
    } catch (error) {
      // Timeout/throw is not a definitive logout — keep checking / last ready cache.
      void error
    }
  }
}

function defaultDetect(options: { timeoutMs: number; force?: boolean }): Promise<ConnectionSnapshot[]> {
  if (process.env.VITEST === 'true') return Promise.resolve([])
  return detectConnections({ timeoutMs: options.timeoutMs, force: options.force === true })
}

function toCard(snap: ConnectionSnapshot, menuSource?: MenuSource): ConnectionView {
  const row = toUiConnection(snap)
  const kind = row.id === 'claude' || row.id === 'codex' || row.id === 'cursor' || row.id === 'opencode'
    ? row.id
    : 'dsh'
  // EFF-1: what the ENGINE accepts (its models and the level menu of each). Absent when it said nothing.
  const menu = engineModelsOf({ models: snap.models, ...(snap.modelMenu === undefined ? {} : { modelMenu: snap.modelMenu }) })
  const card: ConnectionView = {
    id: row.id,
    kind,
    available: row.available,
    loggedIn: row.loggedIn,
    loginHint: row.loginHint,
    ...(snap.version === undefined || snap.version === '' ? {} : { version: snap.version }),
    phase: snap.authUnknown === true ? 'checking' : 'ready',
    ...(menu.models.length === 0 ? {} : { models: menu.models }),
    ...(menu.defaultEffortLevels.length === 0 ? {} : { defaultEffortLevels: menu.defaultEffortLevels }),
    // Where the menu came from: the engine said it (`cli`, also for Codex whose detection carries one) or it is our table (`static`).
    ...(menu.models.length === 0 ? {} : { source: menuSource ?? 'cli' }),
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
