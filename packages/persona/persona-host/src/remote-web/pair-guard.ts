/**
 * MARCO M5 (Lumen B): the codes that open a pairing, and the lock that guards them. The format is the Estação's (eight characters of the same alphabet, ten minutes, one use) but the STATE lives on
 * disk: the hashes of the open codes, the wrong guesses, the lock and the per-address counters survive a restart, so restarting the app never gives an attacker a fresh set of tries.
 *
 * Rules (Lumen B2 + the 14:55 review): five wrong tries from ONE address in ten minutes LOCK THAT ADDRESS ("wait", with how long; the penalty doubles at each strike up to an hour) and nobody else — a
 * malicious node of the tailnet cannot close the owner's pairing by guessing wrong. Only the GLOBAL ceiling (thirty wrong guesses an hour, counted ONLY while a code is open) burns every open code and
 * locks the book for ten minutes (the owner opens another and the lock is gone). With no code open a wrong guess counts for the address and for nothing else. 40 bits, ten minutes and these ceilings
 * make guessing a code infeasible without burning anything. The code itself is never kept (only its SHA-256), never logged and never in a response.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { PAIRING_ALPHABET, PAIRING_LENGTH, PAIRING_LOCK_MS, PAIRING_TTL_MS } from '../station/pairing.ts'

/** Wrong tries per address in the window; the next try is "wait". */
export const PAIR_ADDRESS_MAX = 5
/** The window of {@link PAIR_ADDRESS_MAX}. */
export const PAIR_ADDRESS_WINDOW_MS = 10 * 60_000
/** Wrong guesses overall (while a code is open) per hour. */
export const PAIR_GLOBAL_MAX = 30
/** The window of {@link PAIR_GLOBAL_MAX}. */
export const PAIR_GLOBAL_WINDOW_MS = 3_600_000
/** First penalty after an address passes its ceiling; doubles at each strike up to {@link PAIR_BACKOFF_MAX_MS}. */
export const PAIR_BACKOFF_MS = 60_000
/** Longest penalty for one address. */
export const PAIR_BACKOFF_MAX_MS = 3_600_000
/** Codes open at once (an owner pairing a household, not a crowd). */
export const MAX_OPEN_CODES = 5
/** Addresses the state remembers. When it is full only an address that is neither blocked nor recently active makes room: a blocked attacker is never forgotten to admit a new one. */
export const MAX_ADDRESSES = 256

/** An open code, as stored: its hash, never the code. */
export interface StoredCode {
  readonly hash: string
  readonly memberId: string
  readonly expiresAt: number
}

/** Counters of one remote address. */
export interface AddressState {
  /** Times of the wrong tries still inside the window. */
  wrong: number[]
  /** How many times this address went over its ceiling (the next penalty doubles). */
  strikes: number
  /** No answer but "wait" until this time. */
  blockedUntil: number
}

/** Everything the book keeps on disk. */
export interface PairState {
  codes: StoredCode[]
  /** The book is locked (the global ceiling burned the codes) until this time; a new code from the owner opens it. */
  lockedUntil: number
  addresses: Record<string, AddressState>
  /** Times of the wrong guesses made while a code was open (the global ceiling). */
  global: number[]
}

/** Where the state lives. */
export interface PairStore {
  read(): PairState
  write(state: PairState): void
}

const empty = (): PairState => ({ codes: [], lockedUntil: 0, addresses: {}, global: [] })

/** @returns A store that keeps the state in memory (tests). */
export function memoryPairStore(initial?: PairState): PairStore {
  let state: PairState = initial === undefined ? empty() : structuredClone(initial)
  return { read: () => structuredClone(state), write: (next) => { state = structuredClone(next) } }
}

/**
 * A store in one JSON file, written atomically (temp file, then rename). A missing or damaged file is a fresh state with NO open code (nobody is paired by accident; the owner opens a new one).
 * @param path - The file (its folder is created on the first write).
 * @returns The store.
 */
export function filePairStore(path: string): PairStore {
  return {
    read() {
      if (!existsSync(path)) return empty()
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PairState>
        return {
          codes: Array.isArray(parsed.codes) ? parsed.codes.filter(item => typeof item?.hash === 'string' && typeof item.memberId === 'string' && typeof item.expiresAt === 'number') : [],
          lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
          addresses: typeof parsed.addresses === 'object' && parsed.addresses !== null ? parsed.addresses : {},
          global: Array.isArray(parsed.global) ? parsed.global.filter((item): item is number => typeof item === 'number') : [],
        }
      } catch (error) {
        void error
        return empty()
      }
    },
    write(state) {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, path)
    },
  }
}

/** What the PC's screen shows when it opens a code. */
export interface DeviceCode {
  readonly code: string
  readonly expiresAt: string
}

/** The answer to a code typed on a phone. Two reasons only, so the route is no oracle of the code's state. */
export type DeviceRedeem =
  | { readonly ok: true; readonly memberId: string }
  | { readonly ok: false; readonly reason: 'recusado' }
  | { readonly ok: false; readonly reason: 'bloqueado'; readonly retryAfterS: number }

/** The hash of a code: its letters, case and dash forgiven. */
const digestOf = (code: string): Buffer => createHash('sha256').update(code.replace(/[^a-z0-9]/giu, '').toUpperCase()).digest()

/** The pairing codes of this PC and their lock. */
export class DevicePairing {
  private state: PairState

  /**
   * @param store - Where the state lives (a file in the app; memory in tests).
   * @param now - Clock (tests replace it).
   * @param pick - One character of the alphabet (tests replace it).
   */
  constructor(
    private readonly store: PairStore = memoryPairStore(),
    private readonly now: () => number = Date.now,
    private readonly pick: () => string = () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)] ?? '',
  ) {
    this.state = store.read()
    this.prune()
  }

  /**
   * Open a code on the PC's screen. Only the owner asks for one, so it opens the lock again.
   * @param memberId - The member the next device will speak for.
   * @returns The code (shown once) and its deadline.
   */
  issue(memberId: string): DeviceCode {
    this.prune()
    const raw = Array.from({ length: PAIRING_LENGTH }, () => this.pick()).join('')
    const expiresAt = this.now() + PAIRING_TTL_MS
    this.state.codes = [...this.state.codes, { hash: digestOf(raw).toString('hex'), memberId, expiresAt }].slice(-MAX_OPEN_CODES)
    this.state.lockedUntil = 0
    this.save()
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: new Date(expiresAt).toISOString() }
  }

  /**
   * Redeem a code typed on a device.
   * @param code - What was typed (case and dash forgiven).
   * @param address - The remote address that typed it (for the per-address ceiling).
   * @returns The member to pair it to, or why not ("recusado", or "bloqueado" with how long to wait).
   */
  redeem(code: string, address: string): DeviceRedeem {
    this.prune()
    const at = this.now()
    const waiting = this.mustWait(address, at)
    if (waiting !== undefined) return { ok: false, reason: 'bloqueado', retryAfterS: waiting }

    const given = digestOf(code)
    let found = -1
    this.state.codes.forEach((item, index) => { // every open code is compared, no early exit: the time does not say which one was close
      if (timingSafeEqual(Buffer.from(item.hash, 'hex'), given)) found = index
    })
    const open = this.state.codes.length > 0
    if (found === -1) {
      this.noteWrong(address, at, open)
      this.save()
      return { ok: false, reason: 'recusado' }
    }
    const used = this.state.codes[found] as StoredCode
    this.state.codes = this.state.codes.filter((_item, index) => index !== found)
    this.save()
    return { ok: true, memberId: used.memberId }
  }

  /** @returns How many codes are open (the screen's "esperando o celular"). */
  pending(): number {
    this.prune()
    return this.state.codes.length
  }

  /** @returns The seconds the book is locked for ("wait"), or `undefined` when it answers. */
  private mustWait(address: string, at: number): number | undefined {
    const seconds = (until: number): number => Math.max(1, Math.ceil((until - at) / 1000))
    if (this.state.lockedUntil > at) return seconds(this.state.lockedUntil)
    const row = this.state.addresses[address]
    if (row !== undefined && row.blockedUntil > at) return seconds(row.blockedUntil)
    if (row !== undefined && row.wrong.filter(time => at - time < PAIR_ADDRESS_WINDOW_MS).length >= PAIR_ADDRESS_MAX) {
      row.strikes += 1
      row.blockedUntil = at + Math.min(PAIR_BACKOFF_MS * 2 ** (row.strikes - 1), PAIR_BACKOFF_MAX_MS)
      row.wrong = []
      this.save()
      return seconds(row.blockedUntil)
    }
    const overall = this.state.global.filter(time => at - time < PAIR_GLOBAL_WINDOW_MS)
    if (overall.length >= PAIR_GLOBAL_MAX) return seconds((overall[0] as number) + PAIR_GLOBAL_WINDOW_MS)
    return undefined
  }

  private noteWrong(address: string, at: number, codeOpen: boolean): void {
    const known = this.state.addresses[address]
    const row = known ?? { wrong: [], strikes: 0, blockedUntil: 0 }
    row.wrong = [...row.wrong.filter(time => at - time < PAIR_ADDRESS_WINDOW_MS), at]
    if (known !== undefined || Object.keys(this.state.addresses).length < MAX_ADDRESSES) {
      this.state.addresses[address] = row
    } else {
      // Full: only an address that is neither blocked nor recently active makes room (Lumen P2-4: a blocked attacker must never be forgotten to admit a new one). If there is none, this address is not
      // tracked per address — it still counts for the global ceiling below.
      const free = Object.entries(this.state.addresses).find(([, item]) => item.blockedUntil <= at && item.wrong.every(time => at - time >= PAIR_ADDRESS_WINDOW_MS))
      if (free !== undefined) { delete this.state.addresses[free[0]]; this.state.addresses[address] = row }
    }
    if (!codeOpen) return // with no code open a wrong guess costs the owner nothing and counts for no global lock
    this.state.global = [...this.state.global.filter(time => at - time < PAIR_GLOBAL_WINDOW_MS), at]
    if (this.state.global.length >= PAIR_GLOBAL_MAX) {
      this.state.codes = [] // the global ceiling BURNS every open code: the right one, typed later, does not enter
      this.state.global = []
      this.state.lockedUntil = at + PAIRING_LOCK_MS
    }
  }

  private prune(): void {
    const at = this.now()
    const before = this.state.codes.length
    this.state.codes = this.state.codes.filter(item => item.expiresAt > at)
    if (this.state.codes.length !== before) this.save()
  }

  private save(): void {
    this.store.write(this.state)
  }
}
