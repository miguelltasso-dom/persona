/**
 * M4/D-116 (Marco Dogfood): which computers of the team are on right now. The identity of a computer (certificate, roster, confirmation on the PC, revocation) is the Bolt's
 * `computers/computer-registry.ts`; this module only reads that roster and adds what the screens need to say "ligado", "pausado" or "desligado", how much memory is free, how
 * many personas live there and which AI account is signed in (a label).
 *
 * The state is DERIVED from a heartbeat, never typed: `ligado` (seen within 90 s and running), `pausado` (seen, the person turned the station off), `desligado` (not seen).
 * A heartbeat from a computer that is not in the roster (never registered, or revoked) is answered `revogado`: that PC must stop. The signature of the heartbeat is the
 * transport's job; nothing here stores a credential, only a label.
 * Contract: `persona-spec/contracts/marco-dogfood-onde-roda-computadores.md`.
 */

import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from './admission.ts'

/** A heartbeat older than this means the computer is off. */
export const HEARTBEAT_STALE_MS = 90_000
/** Maximum accepted total/free memory value in a heartbeat (64 TiB in bytes). */
export const BEAT_MAX_RAM_BYTES = 64 * 1024 ** 4
/** Maximum accepted persona count reported in a heartbeat. */
export const BEAT_MAX_PERSONAS = 10_000
/** Maximum accepted queue depth reported in a heartbeat. */
export const BEAT_MAX_QUEUE = 10_000
/** Maximum length for `aiAccountLabel` (code points / characters). */
export const BEAT_MAX_LABEL_CHARS = 80

export type ComputerState = 'ligado' | 'pausado' | 'desligado'

/** What a heartbeat may carry. Anything else the sender adds is dropped. */
export interface Beat {
  /** Strictly increasing per computer: a repeated or older beat is refused (replay). */
  readonly counter: number
  /** The person did not turn the station off. */
  readonly running: boolean
  readonly ram: { readonly totalBytes: number; readonly freeBytes: number }
  readonly personaCount: number
  readonly queue: number
  /** A label such as "Claude · conta da Ana". Never a credential. */
  readonly aiAccountLabel?: string
}

/** The part of the Bolt's roster entry this module reads (`ComputerView` of `computer-registry.ts` satisfies it). */
export interface RosterComputer {
  readonly computerId: string
  readonly label: string
  readonly registeredBy: string
  readonly isThis: boolean
}

/** What the screen reads. */
export interface ComputerPresenceView {
  readonly computerId: string
  readonly label: string
  readonly registeredBy: string
  readonly isThis: boolean
  readonly state: ComputerState
  readonly personas: number
  readonly lastSeenAt?: number
  readonly aiAccountLabel?: string
  readonly ram?: { readonly totalBytes: number; readonly freeBytes: number; readonly floorBytes: number; readonly perCliBytes: number }
  /** Extra turns that fit: floor((free − floor) / perCli). */
  readonly capacity?: number
}

/** What survives a restart of the owner's host: the last heartbeat of each computer ("visto pela última vez às…"). */
export interface PresenceRecord {
  readonly lastSeenAt: number
  readonly beat: Beat
}

export interface PresenceDeps {
  readonly now: () => number
  /** The roster of the team, read at every call: a revoked computer vanishes from here and from the screen at once. */
  readonly roster: () => readonly RosterComputer[]
  /** How many personas live on a computer (Flint's "onde roda"); `undefined` falls back to what the heartbeat says. */
  readonly personasOn?: ((computerId: string) => number | undefined) | undefined
  readonly load?: () => Readonly<Record<string, PresenceRecord>>
  readonly save?: (records: Readonly<Record<string, PresenceRecord>>) => void
}

/** The presence of the team's computers. */
export class ComputerPresence {
  private records: Record<string, PresenceRecord>

  /** @param deps - Clock, the roster to read and the optional store. */
  constructor(private readonly deps: PresenceDeps) {
    this.records = { ...(deps.load?.() ?? {}) }
  }

  /**
   * A heartbeat from a computer (the transport already checked its signature).
   * @returns `ok`; `repetido` (replay or older); `revogado` (not in the roster: the PC must stop).
   */
  heartbeat(computerId: string, beat: Beat): 'ok' | 'repetido' | 'revogado' {
    if (!this.deps.roster().some(item => item.computerId === computerId)) {
      if (computerId in this.records) this.forget(computerId)
      return 'revogado'
    }
    const known = this.records[computerId]
    if (known !== undefined && beat.counter <= known.beat.counter) return 'repetido'
    // Only the declared fields are kept: whatever else the sender adds never reaches a screen.
    const cleanLabel = safeAiAccountLabel(beat.aiAccountLabel)
    const clean: Beat = {
      counter: beat.counter, running: beat.running,
      ram: { totalBytes: beat.ram.totalBytes, freeBytes: beat.ram.freeBytes },
      personaCount: beat.personaCount, queue: beat.queue,
      ...(cleanLabel === undefined ? {} : { aiAccountLabel: cleanLabel }),
    }
    this.records[computerId] = { lastSeenAt: this.deps.now(), beat: clean }
    this.deps.save?.(this.records)
    return 'ok'
  }

  /** @returns The state of one computer (Flint's presence port); `desligado` for one that is not in the roster. */
  stateOf(computerId: string): ComputerState {
    if (!this.deps.roster().some(item => item.computerId === computerId)) return 'desligado'
    return this.derive(this.records[computerId])
  }

  /** @returns The ids of the team's computers, as the roster lists them (Flint's presence port). */
  computersOf(): string[] {
    return this.deps.roster().map(item => item.computerId)
  }

  /** @returns The computers of the roster, with their presence, in the roster's order. A revoked computer is not listed. */
  list(): ComputerPresenceView[] {
    return this.deps.roster().map((item): ComputerPresenceView => {
      const record = this.records[item.computerId]
      const beat = record?.beat
      const memory = beat === undefined ? {} : {
        ram: { totalBytes: beat.ram.totalBytes, freeBytes: beat.ram.freeBytes, floorBytes: RAM_FLOOR_BYTES, perCliBytes: RAM_PER_CLI_BYTES },
        capacity: Math.max(0, Math.floor((beat.ram.freeBytes - RAM_FLOOR_BYTES) / RAM_PER_CLI_BYTES)),
      }
      return {
        computerId: item.computerId, label: item.label, registeredBy: item.registeredBy, isThis: item.isThis,
        state: this.derive(record),
        personas: this.deps.personasOn?.(item.computerId) ?? beat?.personaCount ?? 0,
        ...(record === undefined ? {} : { lastSeenAt: record.lastSeenAt }),
        ...(beat?.aiAccountLabel === undefined ? {} : { aiAccountLabel: beat.aiAccountLabel }),
        ...memory,
      }
    })
  }

  private derive(record: PresenceRecord | undefined): ComputerState {
    if (record === undefined || this.deps.now() - record.lastSeenAt > HEARTBEAT_STALE_MS) return 'desligado'
    return record.beat.running ? 'ligado' : 'pausado'
  }

  private forget(computerId: string): void {
    const { [computerId]: _gone, ...rest } = this.records
    this.records = rest
    this.deps.save?.(this.records)
  }
}

/** Inputs needed by a host to build periodic {@link Beat} status payloads. */
export interface BeatBuilderDeps {
  readonly now?: () => number
  readonly initialCounter?: number
  readonly isRunning: () => boolean
  readonly ram: () => { readonly totalBytes: number; readonly freeBytes: number }
  readonly personaCount: () => number
  readonly queue: () => number
  readonly aiAccountLabel?: () => string | undefined
}

function asObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function hasForbiddenLabelContent(text: string): boolean {
  return text.includes('@') || /^(?:Bearer\s+|sk-[a-z0-9_-]+)/iu.test(text)
}

/**
 * Sanitize an AI account/engine display name for presence views and outgoing beats (drops emails, tokens, and control chars).
 *
 * @param raw - Candidate account or engine label.
 * @returns Trimmed single-line label up to {@link BEAT_MAX_LABEL_CHARS} chars, or `undefined` if empty/unsafe.
 */
export function safeAiAccountLabel(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.replace(/\p{Cc}+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (cleaned === '' || hasForbiddenLabelContent(cleaned)) return undefined
  return Array.from(cleaned).slice(0, BEAT_MAX_LABEL_CHARS).join('')
}

/**
 * Closed validator for untrusted {@link Beat} payloads (wire or disk): checks exact types and bounds and drops unknown fields.
 *
 * @param raw - Unknown parsed JSON payload.
 * @returns Validated {@link Beat} without extra fields, or `undefined` if any field is out of range or malformed.
 */
export function parseBeat(raw: unknown): Beat | undefined {
  if (!asObject(raw)) return undefined
  if (!isIntInRange(raw.counter, 0, Number.MAX_SAFE_INTEGER) || typeof raw.running !== 'boolean') return undefined
  if (!isIntInRange(raw.personaCount, 0, BEAT_MAX_PERSONAS) || !isIntInRange(raw.queue, 0, BEAT_MAX_QUEUE)) return undefined
  if (!asObject(raw.ram)) return undefined
  if (!isIntInRange(raw.ram.totalBytes, 1, BEAT_MAX_RAM_BYTES)) return undefined
  if (!isIntInRange(raw.ram.freeBytes, 0, raw.ram.totalBytes)) return undefined
  let aiAccountLabel: string | undefined
  if (raw.aiAccountLabel !== undefined) {
    if (typeof raw.aiAccountLabel !== 'string' || /\p{Cc}/u.test(raw.aiAccountLabel)) return undefined
    const trimmed = raw.aiAccountLabel.trim()
    if (trimmed === '' || Array.from(trimmed).length > BEAT_MAX_LABEL_CHARS || hasForbiddenLabelContent(trimmed)) return undefined
    aiAccountLabel = trimmed
  }
  return {
    counter: raw.counter,
    running: raw.running,
    ram: { totalBytes: raw.ram.totalBytes, freeBytes: raw.ram.freeBytes },
    personaCount: raw.personaCount,
    queue: raw.queue,
    ...(aiAccountLabel === undefined ? {} : { aiAccountLabel }),
  }
}

/**
 * Create a producer that emits strictly monotonic, capped {@link Beat} snapshots for outgoing heartbeats.
 *
 * @param deps - Live host state readers.
 * @returns Closure producing the next {@link Beat} snapshot.
 */
export function createBeatBuilder(deps: BeatBuilderDeps): () => Beat {
  const now = deps.now ?? Date.now
  let lastCounter = Math.max(0, Math.trunc(deps.initialCounter ?? 0))
  return () => {
    const clockCounter = clampInt(now(), 0, Number.MAX_SAFE_INTEGER)
    lastCounter = clockCounter > lastCounter ? clockCounter : Math.min(Number.MAX_SAFE_INTEGER, lastCounter + 1)
    const ram = deps.ram()
    const totalBytes = clampInt(ram.totalBytes, 1, BEAT_MAX_RAM_BYTES)
    const freeBytes = clampInt(ram.freeBytes, 0, totalBytes)
    const aiAccountLabel = safeAiAccountLabel(deps.aiAccountLabel?.())
    return {
      counter: lastCounter,
      running: deps.isRunning(),
      ram: { totalBytes, freeBytes },
      personaCount: clampInt(deps.personaCount(), 0, BEAT_MAX_PERSONAS),
      queue: clampInt(deps.queue(), 0, BEAT_MAX_QUEUE),
      ...(aiAccountLabel === undefined ? {} : { aiAccountLabel }),
    }
  }
}
