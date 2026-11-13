/**
 * MARCO M5: the phones (and notebooks) paired to this PC. A device is a member's session on the remote gate: paired once with a code the owner opened on the PC and approved there, then recognised by a
 * secret the PC made (never typed, never kept in clear: only its SHA-256). Revocable by the owner, expiring when idle, always tied to ONE member chosen at pairing — the wire never says who it is — and
 * BOUND to the tailnet address it paired from (Lumen P1-3): the gate checks the address of every request, so a stolen cookie is worth nothing on another node.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A device nobody used for this long stops working (it is paired again with a new code). Lumen C2. */
export const DEVICE_IDLE_MS = 7 * 24 * 3_600_000
/** A device stops working this long after it was paired, however busy (the person pairs again). Lumen C2. */
export const DEVICE_ABSOLUTE_MS = 30 * 24 * 3_600_000
/** How long a device counts as "online" after its last request. */
export const DEVICE_ONLINE_MS = 2 * 60_000
/** Devices paired at once (a household and a small team, not a crowd). */
export const MAX_DEVICES = 20
/** The book writes "last seen" at most this often (a phone polls: the file must not be rewritten per request). */
const TOUCH_EVERY_MS = 60_000

/** What the book keeps for one device. Never the secret. */
export interface DeviceRecord {
  readonly id: string
  readonly memberId: string
  readonly label: string
  /** SHA-256 (hex) of the secret. */
  readonly secretHash: string
  /** The tailnet address the device paired from; every request must come from it. Empty = not bound = never accepted by the gate. */
  readonly address: string
  /** What Tailscale said about the address when it paired (for the owner's screen). */
  readonly node?: string
  readonly login?: string
  readonly pairedAt: number
  readonly lastSeenAt: number
  readonly revokedAt?: number
}

/** What the PC's screen shows ("Celulares ligados"). */
export interface DeviceView {
  readonly id: string
  readonly memberId: string
  readonly label: string
  readonly address: string
  readonly node?: string
  readonly login?: string
  readonly pairedAt: string
  readonly lastSeenAt: string
  readonly online: boolean
}

/** What a device is bound to when it is enrolled. */
export interface DeviceBinding {
  readonly address: string
  readonly node?: string
  readonly login?: string
}

/** Where the records live. The app's store is a small JSON file in the machine's data folder; tests use memory. */
export interface DeviceStore {
  read(): readonly DeviceRecord[]
  write(records: readonly DeviceRecord[]): void
}

/** @returns A store that keeps the records in memory (tests). */
export function memoryDeviceStore(initial: readonly DeviceRecord[] = []): DeviceStore {
  let records = [...initial]
  return {
    read: () => records,
    write: (next) => { records = [...next] },
  }
}

/**
 * A store in one JSON file, written atomically (a temp file, then a rename): a crash mid-write never leaves half a book.
 * @param path - The file (its folder is created on the first write).
 * @returns The store.
 */
export function fileDeviceStore(path: string): DeviceStore {
  return {
    read() {
      if (!existsSync(path)) return []
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
        return Array.isArray(parsed) ? parsed.filter(isRecord) : []
      } catch (error) {
        void error // a damaged file is an empty book: nobody stays paired by accident
        return []
      }
    },
    write(records) {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(records), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, path)
    },
  }
}

function isRecord(value: unknown): value is DeviceRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.memberId === 'string' && typeof row.label === 'string' && typeof row.secretHash === 'string' && typeof row.address === 'string'
    && typeof row.pairedAt === 'number' && typeof row.lastSeenAt === 'number' && (row.revokedAt === undefined || typeof row.revokedAt === 'number')
}

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest()
const DUMMY = sha256('no-such-device')

/** Why a device could not be added. */
export type EnrollRefusal = 'cheio'

/** The paired devices of this PC. */
export class DeviceBook {
  private records: DeviceRecord[]
  private readonly listeners = new Set<(deviceId: string) => void>()

  /**
   * @param store - Where the records live.
   * @param now - Clock (tests replace it).
   */
  constructor(private readonly store: DeviceStore = memoryDeviceStore(), private readonly now: () => number = Date.now) {
    this.records = [...store.read()]
  }

  /**
   * Pair a device: the PC makes its id and its secret. The secret leaves in the cookie of the pairing answer and nowhere else.
   * @param member - The member the device speaks for (chosen by the owner when the code was opened).
   * @param label - What the person calls it (a short text, cleaned here).
   * @param binding - The tailnet address it paired from (and what Tailscale said about it). Without an address the gate never accepts the device.
   * @returns The device and its secret, or why not.
   */
  enroll(member: string, label: string, binding: DeviceBinding = { address: '' }): { readonly id: string; readonly secret: string } | EnrollRefusal {
    if (this.records.filter(item => item.revokedAt === undefined).length >= MAX_DEVICES) return 'cheio'
    const id = randomBytes(16).toString('hex')
    const secret = randomBytes(32).toString('hex')
    const at = this.now()
    this.records.push({
      id, memberId: member, label: cleanLabel(label), secretHash: sha256(secret).toString('hex'), address: binding.address,
      ...(binding.node === undefined ? {} : { node: binding.node }), ...(binding.login === undefined ? {} : { login: binding.login }), pairedAt: at, lastSeenAt: at,
    })
    this.save()
    return { id, secret }
  }

  /**
   * Recognise a device from the cookie it sent. The comparison takes the same time for a known and an unknown id.
   * @param id - The device id in the cookie.
   * @param secret - The secret in the cookie.
   * @returns The device when it is paired, not revoked and not expired; `undefined` otherwise.
   */
  verify(id: string, secret: string): DeviceRecord | undefined {
    const found = this.records.find(item => item.id === id)
    const stored = found === undefined ? DUMMY : Buffer.from(found.secretHash, 'hex')
    const given = sha256(secret)
    const same = stored.length === given.length && timingSafeEqual(stored, given)
    if (found === undefined || !same || found.revokedAt !== undefined) return undefined
    const at = this.now()
    if (at - found.lastSeenAt > DEVICE_IDLE_MS || at - found.pairedAt > DEVICE_ABSOLUTE_MS) return undefined
    if (at - found.lastSeenAt < TOUCH_EVERY_MS) return found
    const seen: DeviceRecord = { ...found, lastSeenAt: at }
    this.records = this.records.map(item => (item.id === id ? seen : item))
    this.save()
    return seen
  }

  /**
   * Whether a device is still allowed, WITHOUT touching it (the gate asks every second for the sockets it keeps open: a revoked or expired device is cut within a second, whoever revoked it).
   * @param id - The device.
   * @returns `true` when it is paired, not revoked, not idle for too long and inside its absolute life.
   */
  isLive(id: string): boolean {
    const found = this.records.find(item => item.id === id)
    if (found === undefined || found.revokedAt !== undefined) return false
    const at = this.now()
    return at - found.lastSeenAt <= DEVICE_IDLE_MS && at - found.pairedAt <= DEVICE_ABSOLUTE_MS
  }

  /**
   * The record of a device that is live, WITHOUT touching it (the funnel asks it once per call to know the member a paired device speaks for).
   * @param id - The device.
   * @returns The record when the device is paired, not revoked and not expired; `undefined` otherwise.
   */
  liveRecord(id: string): DeviceRecord | undefined {
    return this.isLive(id) ? this.records.find(item => item.id === id) : undefined
  }

  /**
   * Cut a device off (the owner on the PC, or the device leaving by itself). Listeners hear it so the gate can drop its sockets and abort its calls at once.
   * @param id - The device.
   * @returns `true` when it was paired and is now cut.
   */
  revoke(id: string): boolean {
    const found = this.records.find(item => item.id === id && item.revokedAt === undefined)
    if (found === undefined) return false
    this.records = this.records.map(item => (item.id === id ? { ...item, revokedAt: this.now() } : item))
    this.save()
    for (const listener of this.listeners) listener(id)
    return true
  }

  /**
   * @param id - The device.
   * @param label - The new name.
   * @returns `true` when the device exists and is not revoked.
   */
  rename(id: string, label: string): boolean {
    const found = this.records.find(item => item.id === id && item.revokedAt === undefined)
    if (found === undefined) return false
    this.records = this.records.map(item => (item.id === id ? { ...item, label: cleanLabel(label) } : item))
    this.save()
    return true
  }

  /** @returns The devices the PC's screen shows (revoked ones are gone from it); the secret hash never leaves the book. */
  list(): readonly DeviceView[] {
    const at = this.now()
    return this.records.filter(item => item.revokedAt === undefined).map(item => ({
      id: item.id,
      memberId: item.memberId,
      label: item.label,
      address: item.address,
      ...(item.node === undefined ? {} : { node: item.node }),
      ...(item.login === undefined ? {} : { login: item.login }),
      pairedAt: new Date(item.pairedAt).toISOString(),
      lastSeenAt: new Date(item.lastSeenAt).toISOString(),
      online: at - item.lastSeenAt <= DEVICE_ONLINE_MS,
    }))
  }

  /**
   * @param listener - Called with the device id on every revoke.
   * @returns The function that stops listening.
   */
  onRevoked(listener: (deviceId: string) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private save(): void {
    this.store.write(this.records)
  }
}

/** A device's name: one short line, no control characters, never empty. */
function cleanLabel(label: string): string {
  const text = label.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 40)
  return text === '' ? 'Celular' : text
}
