/**
 * MARCO M5 (Lumen B4): a right code is NOT a session. It opens a REQUEST that the owner approves on the PC ("O celular Pixel da Ana (100.x.y.z · pixel-da-ana · ana@…) quer entrar · Aprovar / Recusar");
 * only the approval makes the device and its secret. The phone holds a `pollToken` (128 bits, only its hash is kept here) and asks for the answer; the secret leaves once, to whoever holds that token. A
 * code photographed by somebody else buys nothing without the owner's click — and the click shows what Tailscale says the address is, not only the name the phone gave itself.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DeviceBook } from './device-book.ts'
import type { TailnetIdentity } from './tailnet-identity.ts'

/** How long a request waits for the owner. */
export const PAIR_REQUEST_TTL_MS = 2 * 60_000
/** After an approval the phone has this long to collect its cookie (an approval at 1:59 does not leave it one second). */
export const PAIR_COLLECT_MS = 30_000
/** Requests waiting at once (the screen is one list; a flood fills it, not the PC). */
export const MAX_PAIR_REQUESTS = 5

/** What the PC's screen shows for a waiting request. */
export interface PairRequestView {
  readonly requestId: string
  readonly memberId: string
  readonly label: string
  readonly address: string
  /** What Tailscale says about the address (absent when it does not say). */
  readonly node?: string
  readonly login?: string
  /** The member is the OWNER and the login is not the PC's: the screen says so and only "Recusar" works. */
  readonly loginMismatch: boolean
  readonly askedAt: string
  readonly expiresAt: string
}

/** What a phone gets when it asks. */
export type PairPoll =
  | { readonly state: 'esperando-o-dono' }
  | { readonly state: 'recusado' }
  | { readonly state: 'vencido' }
  | { readonly state: 'desconhecido' }
  | { readonly state: 'aprovado'; readonly memberId: string; readonly device: { readonly id: string; readonly secret: string; readonly label: string } }

interface Entry {
  readonly requestId: string
  readonly memberId: string
  readonly label: string
  readonly address: string
  readonly identity: TailnetIdentity
  readonly loginMismatch: boolean
  readonly askedAt: number
  /** Waiting: when the owner's time runs out. Approved: when the phone's time to collect runs out. */
  deadline: number
  readonly pollHash: Buffer
  state: 'esperando' | 'aprovado' | 'recusado'
  /** The device the approval made, held in memory until its phone collects it. */
  delivery?: { id: string; secret: string; label: string }
}

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest()

/** The pairing requests waiting for the owner. */
export class PairRequests {
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Set<(view: PairRequestView) => void>()

  /**
   * @param book - The devices (an approval enrols one).
   * @param now - Clock (tests replace it).
   */
  constructor(private readonly book: DeviceBook, private readonly now: () => number = Date.now) {}

  /**
   * A phone typed a right code: wait for the owner.
   * @param input - The member the code was opened for, the name the phone gave itself, the address it came from, what Tailscale says about it and whether the login is wrong for an owner.
   * @returns The request and the token only this phone holds, or `cheio`.
   */
  open(input: {
    readonly memberId: string
    readonly label: string
    readonly address: string
    readonly identity?: TailnetIdentity
    readonly loginMismatch?: boolean
  }): { readonly requestId: string; readonly pollToken: string } | 'cheio' {
    this.sweep()
    if ([...this.entries.values()].filter(item => item.state === 'esperando').length >= MAX_PAIR_REQUESTS) return 'cheio'
    const requestId = randomBytes(8).toString('hex')
    const pollToken = randomBytes(16).toString('hex')
    const at = this.now()
    const label = input.label.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 40) || 'Celular'
    const entry: Entry = {
      requestId, memberId: input.memberId, label, address: input.address, identity: input.identity ?? {}, loginMismatch: input.loginMismatch === true,
      askedAt: at, deadline: at + PAIR_REQUEST_TTL_MS, pollHash: sha256(pollToken), state: 'esperando',
    }
    this.entries.set(requestId, entry)
    for (const listener of this.listeners) listener(viewOf(entry))
    return { requestId, pollToken }
  }

  /** @returns The requests waiting for the owner, oldest first. */
  list(): readonly PairRequestView[] {
    this.sweep()
    return [...this.entries.values()].filter(item => item.state === 'esperando').map(viewOf)
  }

  /**
   * The owner approves on the PC: the device is made now, bound to the address (and what Tailscale says), and its secret waits in memory for the phone that holds the token.
   * @param requestId - The request.
   * @returns `true` when a waiting request became a device. An OWNER's device whose Tailscale login is not the PC's cannot be approved (only refused).
   */
  approve(requestId: string): boolean {
    this.sweep()
    const entry = this.entries.get(requestId)
    if (entry === undefined || entry.state !== 'esperando' || entry.loginMismatch) return false
    const made = this.book.enroll(entry.memberId, entry.label, { address: entry.address, ...entry.identity })
    if (made === 'cheio') { entry.state = 'recusado'; return false }
    entry.state = 'aprovado'
    entry.delivery = { id: made.id, secret: made.secret, label: entry.label }
    entry.deadline = this.now() + PAIR_COLLECT_MS // the phone gets its own time to collect, whenever the owner clicked
    return true
  }

  /**
   * The owner says no.
   * @param requestId - The request.
   * @returns `true` when a waiting request was refused.
   */
  reject(requestId: string): boolean {
    this.sweep()
    const entry = this.entries.get(requestId)
    if (entry === undefined || entry.state !== 'esperando') return false
    entry.state = 'recusado'
    return true
  }

  /**
   * The phone asks what became of its request. An approval is handed over ONCE; after that the token means nothing.
   * @param pollToken - What the phone was given when it typed the code.
   * @returns The state, and the device with its secret the one time it is approved.
   */
  poll(pollToken: string): PairPoll {
    this.sweep()
    const given = sha256(pollToken)
    let found: Entry | undefined
    for (const entry of this.entries.values()) if (timingSafeEqual(entry.pollHash, given)) found = entry
    if (found === undefined) return { state: 'desconhecido' }
    if (found.state === 'esperando') return { state: 'esperando-o-dono' }
    if (found.state === 'recusado') { this.entries.delete(found.requestId); return { state: 'recusado' } }
    const delivery = found.delivery
    this.entries.delete(found.requestId)
    return delivery === undefined ? { state: 'desconhecido' } : { state: 'aprovado', memberId: found.memberId, device: delivery }
  }

  /**
   * @param listener - Called when a request opens (the PC notifies the owner of every new pairing).
   * @returns The function that stops listening.
   */
  onRequest(listener: (view: PairRequestView) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Requests the owner never answered, and approvals the phone never collected, expire (and an uncollected device is cut off). */
  private sweep(): void {
    const at = this.now()
    for (const [id, entry] of this.entries) {
      if (entry.deadline > at) continue
      if (entry.delivery !== undefined) this.book.revoke(entry.delivery.id) // approved but never collected: nobody holds its secret
      this.entries.delete(id)
    }
  }
}

function viewOf(entry: Entry): PairRequestView {
  return {
    requestId: entry.requestId, memberId: entry.memberId, label: entry.label, address: entry.address,
    ...(entry.identity.node === undefined ? {} : { node: entry.identity.node }), ...(entry.identity.login === undefined ? {} : { login: entry.identity.login }),
    loginMismatch: entry.loginMismatch, askedAt: new Date(entry.askedAt).toISOString(), expiresAt: new Date(entry.deadline).toISOString(),
  }
}
