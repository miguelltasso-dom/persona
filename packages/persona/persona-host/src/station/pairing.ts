/**
 * COLHEITA 24 (Carbon §1.3): pairing a dedicated station takes thirty seconds — the person's PC shows a one-time code, the
 * station types it, and the station gets its own key pair sealed on that machine. Only the SHA-256 of the code is kept, it
 * lives ten minutes and it works once, so a screenshot of the code is worth nothing after the first use.
 *
 * The transport that carries the code to the team's hub is item 23's E2EE socket; this module is the book both sides share.
 */

import { createHash, randomInt } from 'node:crypto'
import type { PairingLockState, PairingLockStore } from './pairing-lock-store.ts'
import type { StationPairingCode } from '../types.ts'

/** M4: codes waiting at once; the sixth invalidates the oldest. */
export const MAX_LIVE_CODES = 5
/** M4 (Keel 12/11 14:47): redemptions per hour, right codes included, so the registration screen is no target for mass attempts. */
export const MAX_REDEEMS_PER_HOUR = 10
const HOUR_MS = 60 * 60_000

/** How long a code is worth. */
export const PAIRING_TTL_MS = 10 * 60_000
/** Unambiguous characters: no 0/O, no 1/I. */
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Characters in a code (shown as `XXXX-XXXX`). */
export const PAIRING_LENGTH = 8

/** Why a code did not pair. */
export type PairingRefusal = 'invalido' | 'expirado' | 'usado' | 'bloqueado'
/** Carbon P0-13: wrong codes in a row that lock the book (the code has eight characters: it must not be guessable by trying). */
export const PAIRING_MAX_MISSES = 5
/** How long the book stays locked after {@link PAIRING_MAX_MISSES} wrong codes. A new code issued by the owner opens it again. */
export const PAIRING_LOCK_MS = 10 * 60_000

/** What the book keeps: never the code itself. */
interface PairingEntry {
  readonly expiresAt: number
  used: boolean
}

/** What the book needs. */
export interface PairingBookDeps {
  /** Clock; default `Date.now`. */
  readonly now?: () => number
  /** One character of the alphabet (tests replace it); default a uniform random pick. */
  readonly pick?: () => string
  /** Where the lock (wrong guesses, lock instant, hourly redemptions) survives a restart; default RAM only. */
  readonly store?: PairingLockStore
}

/** The one-time codes of a station pairing. */
export class PairingBook {
  private readonly live = new Map<string, PairingEntry>()
  private readonly deps: PairingBookDeps
  private misses = 0
  private lockedUntil = 0
  private redeemedAt: number[] = []

  /** @param deps - Clock, character source and the optional lock store. */
  constructor(deps: PairingBookDeps = {}) {
    this.deps = deps
    const stored = deps.store?.load()
    if (stored === 'corrupt') {
      // Fail closed: a lock file nobody can read is a full lock, never an empty one.
      this.lockedUntil = (deps.now ?? Date.now)() + PAIRING_LOCK_MS
      this.remember()
    } else if (stored !== undefined && stored !== 'missing') {
      this.misses = stored.misses
      this.lockedUntil = stored.lockedUntil
      this.redeemedAt = [...stored.redeemedAt]
    }
  }

  private remember(): void {
    const state: PairingLockState = { misses: this.misses, lockedUntil: this.lockedUntil, redeemedAt: this.redeemedAt }
    this.deps.store?.save(state)
  }

  /**
   * Issue a code for the person's screen.
   * @returns The code (shown once) and when it stops working.
   */
  issue(): StationPairingCode {
    const pick = this.deps.pick ?? (() => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)] ?? '')
    const raw = Array.from({ length: PAIRING_LENGTH }, () => pick()).join('')
    const expiresAt = (this.deps.now ?? Date.now)() + PAIRING_TTL_MS
    this.live.set(hashOf(raw), { expiresAt, used: false })
    // The sixth waiting code invalidates the oldest (a `Map` keeps insertion order).
    for (const key of [...this.live.keys()].slice(0, Math.max(0, this.live.size - MAX_LIVE_CODES))) this.live.delete(key)
    // A new code is a new secret the guesses so far say nothing about, and only the owner asks for it: it opens the book again.
    this.misses = 0
    this.lockedUntil = 0
    this.remember()
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: new Date(expiresAt).toISOString() }
  }

  /**
   * Redeem a code typed on the station.
   * @param code - What was typed (`XXXX-XXXX`, case and dashes forgiven).
   * @returns `ok`, or why it did not pair.
   */
  redeem(code: string): 'ok' | PairingRefusal {
    const now = (this.deps.now ?? Date.now)()
    if (now < this.lockedUntil) return 'bloqueado'
    const key = hashOf(code)
    const entry = this.live.get(key)
    if (entry === undefined) {
      this.misses += 1
      if (this.misses >= PAIRING_MAX_MISSES) {
        this.misses = 0
        this.lockedUntil = now + PAIRING_LOCK_MS
        // Five wrong codes burn the codes still waiting: the right one typed afterwards does not enter, the owner issues another.
        this.live.clear()
      }
      this.remember()
      return 'invalido'
    }
    if (entry.used) return 'usado'
    if (now >= entry.expiresAt) return 'expirado'
    this.redeemedAt = this.redeemedAt.filter(at => now - at < HOUR_MS)
    if (this.redeemedAt.length >= MAX_REDEEMS_PER_HOUR) return 'bloqueado'
    entry.used = true
    this.misses = 0
    this.redeemedAt.push(now)
    this.remember()
    return 'ok'
  }

  /** @returns How many codes are still unused and unexpired (the screen's "esperando a estação"). */
  pending(): number {
    const now = (this.deps.now ?? Date.now)()
    let count = 0
    for (const entry of this.live.values()) if (!entry.used && now < entry.expiresAt) count += 1
    return count
  }
}

/** The stored form of a code: SHA-256 of the letters, case and dashes forgiven. */
function hashOf(code: string): string {
  return createHash('sha256').update(code.replace(/[^a-z0-9]/giu, '').toUpperCase()).digest('hex')
}
