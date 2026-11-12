/**
 * COLHEITA 24 (Carbon §1.3): pairing a dedicated station takes thirty seconds — the person's PC shows a one-time code, the
 * station types it, and the station gets its own key pair sealed on that machine. Only the SHA-256 of the code is kept, it
 * lives ten minutes and it works once, so a screenshot of the code is worth nothing after the first use.
 *
 * The transport that carries the code to the team's hub is item 23's E2EE socket; this module is the book both sides share.
 */

import { createHash, randomInt } from 'node:crypto'
import type { StationPairingCode } from '../types.ts'

/** How long a code is worth. */
export const PAIRING_TTL_MS = 10 * 60_000
/** Unambiguous characters: no 0/O, no 1/I. */
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Characters in a code (shown as `XXXX-XXXX`). */
export const PAIRING_LENGTH = 8

/** Why a code did not pair. */
export type PairingRefusal = 'invalido' | 'expirado' | 'usado'

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
}

/** The one-time codes of a station pairing. */
export class PairingBook {
  private readonly live = new Map<string, PairingEntry>()
  private readonly deps: PairingBookDeps

  /** @param deps - Clock and character source. */
  constructor(deps: PairingBookDeps = {}) {
    this.deps = deps
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
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: new Date(expiresAt).toISOString() }
  }

  /**
   * Redeem a code typed on the station.
   * @param code - What was typed (`XXXX-XXXX`, case and dashes forgiven).
   * @returns `ok`, or why it did not pair.
   */
  redeem(code: string): 'ok' | PairingRefusal {
    const key = hashOf(code)
    const entry = this.live.get(key)
    if (entry === undefined) return 'invalido'
    if (entry.used) return 'usado'
    if ((this.deps.now ?? Date.now)() >= entry.expiresAt) return 'expirado'
    entry.used = true
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
