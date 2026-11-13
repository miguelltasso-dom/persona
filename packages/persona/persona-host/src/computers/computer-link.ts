/**
 * D-116 (Bolt): how the computers of the team talk to each other, over the tailnet and nothing else. Two small routes on each computer's gate, both answered only to a computer that signs its request
 * (`computer-auth.ts`) with the key the owner certified:
 *  - `POST /remote/computer/beat`: a member tells the OWNER's PC "I am here, my door is on this port" and gets back the signed roster and where the others are. The owner's PC is the DIRECTORY of the team
 *    (v1: two or three computers; when the relay of items 23/25 is on, the same messages go through the hub). Every beat is also the proof that the computer is on: presence of a persona is the presence of her computer.
 *  - `POST /remote/computer/message`: one message of the handoff (`bundle`, `received`, `released`, `activated`). They are opaque to this layer: the bundle is sealed for the receiver and every message that decides
 *    something is signed by the computer that says it, so the transport adds no trust and takes none away; it is fire and forget, may drop, may repeat (that is what the protocol assumes).
 * An address learned from a beat is `<the address the beat came from>:<the announced port>`: a computer cannot claim to be somewhere else. This computer only dials a tailnet address.
 */

import { isTailnetAddress } from '../remote-web/tailnet-bind.ts'
import { parseBeat, type Beat } from '../station/computer-presence.ts'
import type { RosterGuard, SignedRoster } from './computer-cert.ts'
import { COMPUTER_HEADER, signComputerRequest } from './computer-auth.ts'
import { HandoffError, type HandoffMessage, type Link } from './handoff.ts'

/** How often a member tells the owner's PC it is on. */
export const BEAT_MS = 30_000
/** A computer that has not beaten for this long is offline (two beats and a bit). */
export const PRESENCE_MS = 90_000
/** Biggest body a computer reads from another (a sealed bundle is at most 8 MB before the base64 of its cipher text). */
export const COMPUTER_BODY_MAX = 12_000_000
/** How long one call to another computer may take. */
export const COMPUTER_CALL_TIMEOUT_MS = 15_000
/** Endpoints the directory keeps. */
export const MAX_ENDPOINTS = 256

const ADDRESS = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/u
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Where one computer's door is, and how long ago it was last heard. */
export interface Endpoint {
  readonly computerId: string
  /** `ip:port`. */
  readonly address: string
  readonly lastSeen: number
}

/** Who is where, by what the computers announced. */
export class ComputerDirectory {
  private readonly map = new Map<string, Endpoint>()

  /** @param now - Clock (tests replace it). */
  constructor(private readonly now: () => number = Date.now) {}

  /**
   * @param computerId - The computer.
   * @param address - `ip:port` of its door.
   * @param at - When it was heard (default: now).
   * @returns `false` when the address is not an `ip:port`.
   */
  note(computerId: string, address: string, at: number = this.now()): boolean {
    const match = ADDRESS.exec(address)
    if (match === null || Number(match[2]) < 1 || Number(match[2]) > 65_535) return false
    if (!this.map.has(computerId) && this.map.size >= MAX_ENDPOINTS) return false
    this.map.set(computerId, { computerId, address, lastSeen: at })
    return true
  }

  /** @param computerId - The computer. @returns Where it is, or `undefined`. */
  endpointOf(computerId: string): Endpoint | undefined {
    return this.map.get(computerId)
  }

  /** @param computerId - The computer. @returns Whether it was heard within {@link PRESENCE_MS}. */
  online(computerId: string): boolean {
    const found = this.map.get(computerId)
    return found !== undefined && this.now() - found.lastSeen < PRESENCE_MS
  }

  /** @param computerId - The computer. */
  forget(computerId: string): void {
    this.map.delete(computerId)
  }

  /** @returns Everyone, as the wire carries it: how long ago each was heard (no clock of ours crosses the wire). */
  wire(): readonly { readonly computerId: string; readonly address: string; readonly ageMs: number }[] {
    const at = this.now()
    return [...this.map.values()].map(item => ({ computerId: item.computerId, address: item.address, ageMs: Math.max(0, at - item.lastSeen) }))
  }

  /**
   * Take the owner's directory from a beat answer. An entry already here that is more recent stays; this computer's own entry is never overwritten.
   * @param value - What came on the wire (untrusted).
   * @param selfId - This computer's id.
   */
  merge(value: unknown, selfId: string): void {
    if (!Array.isArray(value)) return
    const at = this.now()
    for (const item of value.slice(0, MAX_ENDPOINTS) as unknown[]) {
      if (!isObject(item) || typeof item.computerId !== 'string' || typeof item.address !== 'string' || typeof item.ageMs !== 'number' || !Number.isFinite(item.ageMs) || item.ageMs < 0 || item.computerId === selfId) continue
      const heard = at - item.ageMs
      const held = this.map.get(item.computerId)
      if (held !== undefined && held.lastSeen >= heard) continue
      this.note(item.computerId, item.address, heard)
    }
  }
}

/** The shape of a handoff message from the wire; anything else is not one. */
export function cleanMessage(value: unknown): HandoffMessage | undefined {
  if (!isObject(value) || typeof value.type !== 'string' || typeof value.transferId !== 'string') return undefined
  const text = (key: string): boolean => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= 300
  const number = (key: string): boolean => typeof value[key] === 'number' && Number.isFinite(value[key])
  switch (value.type) {
    case 'bundle': return text('transferId') && text('digest') && isObject(value.sealed) && isObject(value.sealed.header) && isObject(value.sealed.wrap) && isObject(value.sealed.sealed) ? value as unknown as HandoffMessage : undefined
    case 'received': return text('personaId') && text('digest') && text('by') && text('sig') && number('epoch') ? value as unknown as HandoffMessage : undefined
    case 'released': return text('personaId') && text('from') && text('to') && text('sig') && number('epoch') && number('activateBefore') ? value as unknown as HandoffMessage : undefined
    case 'activated': return text('personaId') && text('by') && text('sig') && number('epoch') ? value as unknown as HandoffMessage : undefined
    default: return undefined
  }
}

/** What one computer is in the team's directory. */
export type LinkRole =
  | {
    readonly kind: 'owner'
    /** The signed roster to hand to a member (re-signed when it is getting old). */
    readonly roster: () => SignedRoster | undefined
    /** `ip:port` of THIS computer's own door (the owner is in its own directory). */
    readonly selfEndpoint: () => string | undefined
  }
  | {
    readonly kind: 'member'
    readonly ownerComputerId: string
    /** Where the owner's PC was last reached (`ip:port`). */
    readonly ownerAddress: () => string | undefined
  }

/** What the link needs. */
export interface ComputerLinkDeps {
  readonly self: { readonly id: string; readonly signingSeed: string }
  readonly roster: RosterGuard
  readonly directory: ComputerDirectory
  readonly role: LinkRole
  /** The port of THIS computer's door (a member announces it with each beat); `undefined` while the door is closed. */
  readonly port: () => number | undefined
  /** A message of the handoff arrived from a verified computer: give it to the receiver or the sender. May throw `HandoffError`. */
  readonly onMessage: (from: string, message: HandoffMessage) => void
  /** D-116 executor: where `POST /remote/computer/executor` goes (the persona's home runs her turns for the project's PC). Absent = that door is a 404. */
  readonly executor?: { handle(from: string, body: unknown): Promise<LinkAnswer> }
  /** M4/D-116: optional live machine status supplied by a member for each outbound beat. */
  readonly beatStatus?: (() => Beat | undefined) | undefined
  /** M4/D-116: optional callback on the owner's PC invoked only after signature and known roster checks verify. */
  readonly onBeat?: ((from: string, status: Beat | undefined) => void) | undefined
  /** Replaced in tests. */
  readonly fetch?: typeof fetch
  readonly now?: () => number
  /** TESTS ONLY: replaces "a tailnet address only" for the computers this one dials. The app never passes this. */
  readonly allowAddress?: (host: string) => boolean
  readonly callTimeoutMs?: number
}

/** What an inbound call is answered with. */
export interface LinkAnswer {
  readonly status: number
  readonly body: unknown
}

/** The link between computers. */
export class ComputerLink implements Link {
  private timer: ReturnType<typeof setInterval> | undefined
  private lastBeatOk = 0
  private readonly now: () => number

  /** @param deps - See {@link ComputerLinkDeps}. */
  constructor(private readonly deps: ComputerLinkDeps) {
    this.now = deps.now ?? Date.now
  }

  /**
   * A signed call arrived (the gate verified who made it).
   * @param kind - `beat` or `message`.
   * @param from - The caller's computer id.
   * @param remote - The address the call came from.
   * @param text - The body.
   * @returns The status and the body to answer with.
   */
  handle(kind: 'beat' | 'message', from: string, remote: string, text: string): LinkAnswer
  handle(kind: 'beat' | 'message' | 'executor', from: string, remote: string, text: string): LinkAnswer | Promise<LinkAnswer>
  handle(kind: 'beat' | 'message' | 'executor', from: string, remote: string, text: string): LinkAnswer | Promise<LinkAnswer> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch (error) {
      void error
      return { status: 400, body: { ok: false, reason: 'malformed' } }
    }
    if (kind === 'executor') return this.deps.executor === undefined ? { status: 404, body: { ok: false } } : this.deps.executor.handle(from, parsed)
    if (kind === 'beat') return this.onBeat(from, remote, parsed)
    const message = cleanMessage(parsed)
    if (message === undefined) return { status: 400, body: { ok: false, reason: 'malformed' } }
    try {
      this.deps.onMessage(from, message)
      return { status: 202, body: { ok: true } }
    } catch (error) {
      if (error instanceof HandoffError) return { status: 409, body: { ok: false, reason: error.code } }
      return { status: 500, body: { ok: false, reason: 'internal' } }
    }
  }

  /** The Link of the handoff: a message to another computer. Fire and forget; a computer whose door is not known is simply not reached (the protocol's own timeouts decide what that means). */
  send(to: string, message: HandoffMessage): void {
    void this.post(to, '/remote/computer/message', JSON.stringify(message)).catch((error: unknown) => { void error })
  }

  /**
   * A signed call to another computer's door, with the answer read (the executor's calls need it; the handoff's do not).
   * @param to - The computer.
   * @param path - A route of its door.
   * @param body - The JSON body.
   * @returns The status and the parsed JSON (absent when the body was not JSON).
   * @throws When the computer is unknown, not a tailnet address or unreachable.
   */
  async request(to: string, path: string, body: unknown): Promise<{ readonly status: number; readonly json?: unknown }> {
    const reply = await this.post(to, path, JSON.stringify(body))
    const json = await reply.json().catch(() => undefined) as unknown
    return json === undefined ? { status: reply.status } : { status: reply.status, json }
  }

  /** @param computerId - A computer of the team. @returns Whether it is on: this one always, the others by their last beat (a member knows the owner's PC by its last answer). */
  isOnline(computerId: string): boolean {
    if (computerId === this.deps.self.id) return true
    if (this.deps.role.kind === 'member' && computerId === this.deps.role.ownerComputerId) return this.now() - this.lastBeatOk < PRESENCE_MS
    return this.deps.directory.online(computerId)
  }

  /**
   * A member tells the owner's PC it is on, and takes back the roster and the directory.
   * @returns `ok`, or why not (`no-owner`: not a member or the owner's address unknown; `unreachable`; `refused`: the owner's PC did not accept this computer's proof).
   */
  async beat(): Promise<'ok' | 'no-owner' | 'unreachable' | 'refused'> {
    const role = this.deps.role
    const port = this.deps.port()
    if (role.kind !== 'member' || port === undefined) return 'no-owner'
    const owner = role.ownerAddress()
    if (owner === undefined) return 'no-owner'
    this.deps.directory.note(role.ownerComputerId, owner)
    const status = parseBeat(this.deps.beatStatus?.())
    const payload = status === undefined ? { port } : { port, status }
    let reply: Response
    try {
      reply = await this.post(role.ownerComputerId, '/remote/computer/beat', JSON.stringify(payload))
    } catch (error) {
      void error
      return 'unreachable'
    }
    if (reply.status !== 200) return 'refused'
    const json = await reply.json().catch(() => undefined) as unknown
    if (!isObject(json)) return 'refused'
    if (json.roster !== undefined && this.deps.roster.accept(json.roster) !== 'ok') return 'refused' // a roster that does not verify is not believed, and the beat does not count
    this.deps.directory.merge(json.directory, this.deps.self.id)
    this.lastBeatOk = this.now()
    return 'ok'
  }

  /** Starts telling the owner's PC, now and every {@link BEAT_MS}. */
  start(): void {
    if (this.timer !== undefined || this.deps.role.kind !== 'member') return
    void this.beat()
    this.timer = setInterval(() => { void this.beat() }, BEAT_MS)
    this.timer.unref()
  }

  /** Stops beating. */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  private onBeat(from: string, remote: string, body: unknown): LinkAnswer {
    const role = this.deps.role
    if (role.kind !== 'owner') return { status: 404, body: { ok: false } }
    if (this.deps.roster.certOf(from) === undefined) return { status: 401, body: { ok: false, reason: 'unknown-computer' } }
    const port = isObject(body) ? body.port : undefined
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65_535 || !this.deps.directory.note(from, `${remote}:${String(port)}`)) return { status: 400, body: { ok: false, reason: 'malformed' } }
    const rawStatus = isObject(body) ? body.status : undefined
    const status = rawStatus === undefined ? undefined : parseBeat(rawStatus)
    try {
      this.deps.onBeat?.(from, status)
    } catch (error) {
      void error // a failing presence listener never breaks the beat reply
    }
    const own = role.selfEndpoint()
    const everyone = this.deps.directory.wire().filter(item => item.computerId !== this.deps.self.id)
    return { status: 200, body: { ok: true, roster: role.roster(), directory: own === undefined ? everyone : [{ computerId: this.deps.self.id, address: own, ageMs: 0 }, ...everyone] } }
  }

  /** One signed call to another computer's door. */
  private async post(to: string, path: string, body: string): Promise<Response> {
    const address = this.addressOf(to)
    const match = address === undefined ? null : ADDRESS.exec(address)
    if (address === undefined || match === null || !(this.deps.allowAddress ?? isTailnetAddress)(match[1] as string)) throw new Error('unknown door')
    const proof = signComputerRequest({ method: 'POST', path, host: address, body, computerId: this.deps.self.id, signingSeed: this.deps.self.signingSeed, now: this.now() })
    return (this.deps.fetch ?? fetch)(`http://${address}${path}`, {
      method: 'POST', headers: { [COMPUTER_HEADER]: proof, 'content-type': 'application/json', 'x-persona-remote': '1' }, body, redirect: 'error', signal: AbortSignal.timeout(this.deps.callTimeoutMs ?? COMPUTER_CALL_TIMEOUT_MS),
    })
  }

  private addressOf(to: string): string | undefined {
    const known = this.deps.directory.endpointOf(to)?.address
    if (known !== undefined) return known
    return this.deps.role.kind === 'member' && to === this.deps.role.ownerComputerId ? this.deps.role.ownerAddress() : undefined
  }
}
