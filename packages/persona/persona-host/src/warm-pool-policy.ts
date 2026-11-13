/**
 * M4 / 24 h (Probe's finding: 15 child processes at rest after 8 requests): WHICH warm runners a host may let go of.
 *
 * Today `Orchestration.warmRunners` has no ceiling and nothing evicts by idleness (the OAR warm TTL and the session pool's lease are only read when the same key
 * comes back), so every (persona x purpose x conversation x variant) a person ever touched keeps a CLI alive until the app quits. This is the pure policy; the timer,
 * the runners and the disposal live in `warm-pool.ts`. It never touches a runner that is working (a turn in flight is also where a steer, a pending approval and the
 * browser turn live), so the laws of "warm" (browser, connectors, steer) cannot be broken by a sweep: an idle runner that goes away is reopened with the same
 * options by the next turn (the key carries them) and the conversation continues with `--resume`.
 */

/** What kind of runner a key is: a conversation, a Task, or a short answer-only call (triage) that must never push a conversation out. */
export type WarmKind = 'talk' | 'task' | 'answer'

/** One resident runner, as the policy sees it. */
export interface WarmEntry {
  /** `projectId:personaId:purpose[:...]` (the key of `Orchestration.warmRunners`). */
  readonly key: string
  readonly projectId: string
  readonly personaId: string
  readonly kind: WarmKind
  /** The last time it started or finished a turn, or was handed to one (ms on the host clock). */
  readonly lastUsedAt: number
  /** A turn is in flight (or waiting for an approval): never evicted. */
  readonly busy: boolean
}

export type WarmEvictionReason = 'idle' | 'persona-cap' | 'global-cap'

export interface WarmEviction {
  readonly key: string
  readonly reason: WarmEvictionReason
}

/** What a host may keep resident. */
export interface WarmLimits {
  /** Idle for this long and it goes (default 15 min). */
  readonly idleTtlMs: number
  /** Per persona: conversations kept (default 1). */
  readonly talkPerPersona: number
  /** Per persona: Task runners kept (default 1). */
  readonly taskPerPersona: number
  /** Per persona: answer-only (triage) runners kept, one per lane (default 2: a reopen on every call would cost more than the CLI it saves). */
  readonly answerPerPersona: number
  /** In the whole host (default by RAM, see {@link warmCapForRam}). */
  readonly globalCap: number
}

export const DEFAULT_WARM_LIMITS: WarmLimits = { idleTtlMs: 15 * 60_000, talkPerPersona: 1, taskPerPersona: 1, answerPerPersona: 2, globalCap: 8 }

/**
 * @param key - A key of `Orchestration.warmRunners`.
 * @returns Its parts, or `undefined` for a key that is not `projectId:personaId:purpose...` (never guessed: such a runner is left alone).
 */
export function parseWarmKey(key: string): { readonly projectId: string; readonly personaId: string; readonly kind: WarmKind } | undefined {
  const [projectId, personaId, purpose] = key.split(':')
  if (projectId === undefined || personaId === undefined || purpose === undefined || projectId === '' || personaId === '' || purpose === '') return undefined
  const kind: WarmKind = key.includes(':answer-only') ? 'answer' : purpose === 'talk' ? 'talk' : 'task'
  return { projectId, personaId, kind }
}

/**
 * The most runners worth keeping for a machine: 4 GB stay for the system and the app, a CLI costs ~600 MB and the host keeps a margin (x1.5). 8 GB = 4, 16 GB = 8 (the hard ceiling).
 * @param totalBytes - The machine's RAM.
 * @returns The global cap, between 3 and 8.
 */
export function warmCapForRam(totalBytes: number): number {
  const gb = 1024 ** 3
  const fit = Math.floor((totalBytes - 4 * gb) / (1.5 * 600 * 1024 ** 2))
  return Math.min(8, Math.max(3, Number.isFinite(fit) ? fit : 3))
}

/**
 * Decide which resident runners go. Busy runners are never listed. Order of the rules: idle too long, then more than the persona's share (oldest first), then more than the host's cap (oldest first).
 * @param entries - The resident runners.
 * @param now - The host clock (ms).
 * @param limits - What may stay.
 * @returns The keys to evict, each with its reason.
 */
export function planWarmEviction(entries: readonly WarmEntry[], now: number, limits: WarmLimits = DEFAULT_WARM_LIMITS): WarmEviction[] {
  const out: WarmEviction[] = []
  const gone = new Set<string>()
  const take = (key: string, reason: WarmEvictionReason): void => {
    if (gone.has(key)) return
    gone.add(key)
    out.push({ key, reason })
  }
  for (const entry of entries) {
    if (!entry.busy && now - entry.lastUsedAt >= limits.idleTtlMs) take(entry.key, 'idle')
  }
  const byOwner = new Map<string, WarmEntry[]>()
  for (const entry of entries) {
    if (gone.has(entry.key)) continue
    const bucket = `${entry.projectId}:${entry.personaId}:${entry.kind}`
    byOwner.set(bucket, [...(byOwner.get(bucket) ?? []), entry])
  }
  for (const [bucket, owned] of byOwner) {
    const share = bucket.endsWith(':talk') ? limits.talkPerPersona : bucket.endsWith(':answer') ? limits.answerPerPersona : limits.taskPerPersona
    // newest first: the busy ones count toward the share (they stay), the oldest IDLE ones past the share go
    const ranked = [...owned].sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    for (const entry of ranked.slice(Math.max(0, share))) {
      if (!entry.busy) take(entry.key, 'persona-cap')
    }
  }
  const left = entries.filter(entry => !gone.has(entry.key))
  let resident = left.length
  for (const entry of left.filter(item => !item.busy).sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
    if (resident <= limits.globalCap) break
    take(entry.key, 'global-cap')
    resident -= 1
  }
  return out
}
