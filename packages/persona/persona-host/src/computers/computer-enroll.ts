/**
 * D-116 (Bolt): the NEW computer's side of joining the team (B2 of `marco-dogfood-onde-roda.md`). The person typed, on this computer, the address of the owner's PC and the code the owner's screen showed. This computer
 * makes its keys HERE (the private halves never leave it), sends the public halves with the code, shows its own fingerprint so the owner can compare it out loud, waits for the owner's confirmation and keeps what the
 * owner signed: the certificate that names it, the roster and the owner's public key (the anchor every later message is checked against).
 *
 * It only ever speaks to a TAILNET address (never the open internet), checks that what comes back names ITS key and carries the owner's signature, and writes the membership atomically. A grant that does not check is
 * thrown away. Honest limit: the owner's key arrives on the first answer (trust on first use, over the tailnet's own node authentication); the owner's confirmation, which shows THIS computer's fingerprint, is the
 * check a person makes.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { publicIdentity, type Identity, type PublicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { isTailnetAddress } from '../remote-web/tailnet-bind.ts'
import { COMPUTER_REQUEST_TTL_MS, type EnrollGrant } from './computer-registry.ts'
import { RosterGuard, computerFingerprint, computerIdOf, memoryRosterStore, verifyCert, type SignedCert, type SignedRoster } from './computer-cert.ts'

/** The header every state-changing request to the gate carries (the gate's own constant is `REMOTE_HEADER`). */
const REMOTE_HEADER = 'x-persona-remote'
/** The header that carries the poll token (the gate's `POLL_HEADER`). */
const POLL_HEADER = 'x-persona-poll'
/** How often this computer asks the owner's PC whether the owner answered. */
export const ENROLL_POLL_MS = 2_000
/** How long a single call may take. */
export const ENROLL_CALL_TIMEOUT_MS = 10_000

/** What this computer keeps once it belongs to the team. */
export interface Membership {
  readonly workspaceId: string
  /** The trust anchor: every roster, certificate and message of the team is checked against it. */
  readonly ownerSigningPublic: string
  /** The owner's PC, by computer id: the directory of the team (where the others find each other). */
  readonly ownerComputerId: string
  /** Where the owner's PC was reached (`ip:port`); the owner's PC may move, so this is only the first place to look. */
  readonly ownerAddress: string
  readonly cert: SignedCert
  readonly roster: SignedRoster
}

/** Where the membership lives (a file in this machine's data folder; memory in tests). */
export interface MembershipStore {
  read(): Membership | undefined
  write(membership: Membership): void
}

/** @returns A store in memory (tests). */
export function memoryMembershipStore(): MembershipStore {
  let held: Membership | undefined
  return { read: () => (held === undefined ? undefined : structuredClone(held)), write: (value) => { held = structuredClone(value) } }
}

/**
 * A store in one JSON file, written atomically. What is read back must still carry the owner's signature (a hand-edited file is "not a member").
 * @param path - The file (its folder is created on the first write).
 * @returns The store.
 */
export function fileMembershipStore(path: string): MembershipStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Membership>
        if (typeof parsed.workspaceId !== 'string' || typeof parsed.ownerSigningPublic !== 'string' || typeof parsed.ownerComputerId !== 'string' || typeof parsed.ownerAddress !== 'string' || verifyCert(parsed.cert, parsed.ownerSigningPublic) === undefined) return undefined
        return parsed as Membership
      } catch (error) {
        void error // missing or damaged: not a member
        return undefined
      }
    },
    write(value) {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, path)
    },
  }
}

/** Why joining did not work (a closed vocabulary the screen has a sentence for). */
export type EnrollFailure = 'endereco-invalido' | 'ja-cadastrado' | 'codigo-recusado' | 'bloqueado' | 'cheio' | 'revogado' | 'invalido' | 'sem-resposta' | 'vencido' | 'resposta-invalida'

/** Where joining is. */
export type EnrollState =
  | { readonly state: 'livre' }
  | { readonly state: 'esperando-o-dono'; readonly ownerAddress: string; readonly fingerprint: string }
  | { readonly state: 'cadastrado'; readonly computerId: string; readonly label: string; readonly ownerAddress: string }
  | { readonly state: 'recusado' }
  | { readonly state: 'falhou'; readonly reason: EnrollFailure; readonly retryAfterS?: number }

/** What this computer needs. */
export interface EnrollDeps {
  /** This computer's own identity, with the private halves (they stay here). */
  readonly identity: Identity
  readonly store: MembershipStore
  /** Replaced in tests. */
  readonly fetch?: typeof fetch
  /** TESTS ONLY: replaces "a tailnet address only" for the address of the owner's PC (a loopback alias stands in). The app never passes this. */
  readonly allowAddress?: (host: string) => boolean
  readonly now?: () => number
  /** Waits between polls; tests make it instant. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly pollMs?: number
  readonly callTimeoutMs?: number
}

/** What the person typed. */
export interface EnrollInput {
  /** `ip:port` of the owner's PC (what its screen shows). */
  readonly ownerAddress: string
  readonly code: string
  readonly label: string
  readonly ramMb?: number
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Joining the team, as this computer lives it. */
export class ComputerEnrollment {
  private state: EnrollState
  private readonly pub: PublicIdentity
  private abort: AbortController | undefined

  /** @param deps - See {@link EnrollDeps}. */
  constructor(private readonly deps: EnrollDeps) {
    this.pub = publicIdentity(deps.identity)
    const held = deps.store.read()
    this.state = held === undefined ? { state: 'livre' } : { state: 'cadastrado', computerId: held.cert.cert.computerId, label: held.cert.cert.label, ownerAddress: held.ownerAddress }
  }

  /** @returns Where joining is. */
  status(): EnrollState {
    return this.state
  }

  /** @returns What this computer keeps once it belongs to the team (undefined = not a member). */
  membership(): Membership | undefined {
    return this.deps.store.read()
  }

  /** @returns The fingerprint of this computer's two keys: the number the owner compares out loud. */
  fingerprint(): string {
    return computerFingerprint(this.pub)
  }

  /**
   * Type the code on this computer. The answer is the state right after the owner's PC took the code; the wait for the owner's confirmation goes on in the background.
   * @param input - The address, the code and the name.
   * @returns The state.
   */
  async start(input: EnrollInput): Promise<EnrollState> {
    if (this.state.state === 'cadastrado') return this.fail('ja-cadastrado')
    this.abort?.abort()
    const target = this.targetOf(input.ownerAddress)
    if (target === undefined) return this.fail('endereco-invalido')
    const abort = new AbortController()
    this.abort = abort
    const body = JSON.stringify({ code: input.code, label: input.label, signing: this.pub.signing, agreement: this.pub.agreement, ...(input.ramMb === undefined ? {} : { ramMb: input.ramMb }) })
    let reply: Response
    try {
      reply = await this.call(`http://${target}/remote/computer-hello`, { method: 'POST', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json' }, body }, abort.signal)
    } catch (error) {
      void error
      return this.fail('sem-resposta')
    }
    const json = await reply.json().catch(() => undefined) as unknown
    const reason = isObject(json) && typeof json.reason === 'string' ? json.reason : ''
    if (reply.status === 429) return this.fail(reason === 'cheio' ? 'cheio' : 'bloqueado', Number(reply.headers.get('retry-after')) || undefined)
    if (reply.status === 400) return this.fail('invalido')
    if (reply.status === 403) return this.fail(reason === 'revogado' ? 'revogado' : 'codigo-recusado')
    if (reply.status !== 202 || !isObject(json) || typeof json.pollToken !== 'string') return this.fail('resposta-invalida')
    this.state = { state: 'esperando-o-dono', ownerAddress: target, fingerprint: this.fingerprint() }
    void this.wait(target, json.pollToken, abort.signal)
    return this.state
  }

  /** Gives up waiting (the owner's PC forgets the request on its own). */
  cancel(): void {
    this.abort?.abort()
    this.abort = undefined
    if (this.state.state === 'esperando-o-dono') this.state = { state: 'livre' }
  }

  /** The address must be `ip:port` and a tailnet address: this computer never speaks to anything else. */
  private targetOf(raw: string): string | undefined {
    const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/u.exec(raw.trim())
    if (match === null) return undefined
    const host = match[1] as string
    const port = Number(match[2])
    if (port < 1 || port > 65_535) return undefined
    return (this.deps.allowAddress ?? isTailnetAddress)(host) ? `${host}:${String(port)}` : undefined
  }

  private call(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.deps.callTimeoutMs ?? ENROLL_CALL_TIMEOUT_MS)
    return (this.deps.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.any([signal, timeout]) })
  }

  private async wait(target: string, pollToken: string, signal: AbortSignal): Promise<void> {
    const sleep = this.deps.sleep ?? ((ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) }))
    const now = this.deps.now ?? Date.now
    const until = now() + COMPUTER_REQUEST_TTL_MS + 30_000
    while (!signal.aborted) {
      if (now() > until) { this.fail('vencido'); return }
      let answer: unknown
      let status = 0
      try {
        const reply = await this.call(`http://${target}/remote/computer-hello/status`, { headers: { [POLL_HEADER]: pollToken } }, signal)
        status = reply.status
        answer = await reply.json().catch(() => undefined)
      } catch (error) {
        void error
        if (signal.aborted) return
        await sleep(this.deps.pollMs ?? ENROLL_POLL_MS) // the owner's PC may be busy for a moment: keep trying until the request expires
        continue
      }
      if (status === 404) { this.fail('vencido'); return }
      const state = isObject(answer) ? answer.state : undefined
      if (state === 'recusado') { this.state = { state: 'recusado' }; return }
      if (state === 'aprovado' && isObject(answer)) { this.keep(target, answer.grant); return }
      if (state !== 'esperando-o-dono') { this.fail('resposta-invalida'); return }
      await sleep(this.deps.pollMs ?? ENROLL_POLL_MS)
    }
  }

  /** What the owner signed is believed only when it names THIS computer's key and carries the owner's signature (and the roster says so too). */
  private keep(target: string, value: unknown): void {
    if (!isObject(value) || typeof value.workspaceId !== 'string' || typeof value.ownerSigningPublic !== 'string' || typeof value.ownerComputerId !== 'string') { this.fail('resposta-invalida'); return }
    const grant = value as unknown as EnrollGrant
    const cert = verifyCert(grant.cert, grant.ownerSigningPublic)
    if (cert === undefined || cert.signing !== this.pub.signing || cert.agreement !== this.pub.agreement || cert.computerId !== computerIdOf(this.pub)) { this.fail('resposta-invalida'); return }
    const guard = new RosterGuard(grant.workspaceId, grant.ownerSigningPublic, memoryRosterStore(), this.deps.now ?? Date.now)
    if (guard.accept(grant.roster) !== 'ok' || guard.certOf(cert.computerId) === undefined || guard.certOf(grant.ownerComputerId) === undefined) { this.fail('resposta-invalida'); return }
    this.deps.store.write({ workspaceId: grant.workspaceId, ownerSigningPublic: grant.ownerSigningPublic, ownerComputerId: grant.ownerComputerId, ownerAddress: target, cert: grant.cert, roster: grant.roster })
    this.state = { state: 'cadastrado', computerId: cert.computerId, label: cert.label, ownerAddress: target }
  }

  private fail(reason: EnrollFailure, retryAfterS?: number): EnrollState {
    this.state = { state: 'falhou', reason, ...(retryAfterS === undefined ? {} : { retryAfterS }) }
    return this.state
  }
}
