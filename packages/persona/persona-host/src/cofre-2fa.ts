/**
 * Cofre v2 2FA: a site asks for the six digits it sent by SMS/WhatsApp. The persona OPENS a request (the card of attention), the
 * owner fills the digits, and the host reads them ONCE for the browser. The digits never enter the thread, an event, a prompt or a
 * model turn: they are sealed by the vault and the request view carries only its state.
 */

import { randomUUID } from 'node:crypto'
import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { CofreSecrets } from '@deepseek-ai/dsh-persona-vault'

/** `screen_doc` kind of a code request. */
export const COFRE_CODE_DOC = 'cofre-code'

/** How long a request waits for the owner (and how long a filled code stays usable). */
export const CODE_REQUEST_TTL_MS = 10 * 60_000

/** Where a request stands. */
export type CofreCodeState = 'pending' | 'filled' | 'taken' | 'cancelled' | 'expired'

/** A code request as the screen reads it: never the digits. */
export interface CofreCodeRequestView {
  readonly id: string
  readonly projectId: string
  readonly personaId: string
  readonly ticketId?: string
  /** Why the code is needed, in the persona's own words ("o site mandou um código por WhatsApp"). */
  readonly reason: string
  /** The login the persona said the code is for (the site or service), never a secret. */
  readonly site?: string
  readonly state: CofreCodeState
  readonly createdAt: string
  readonly expiresAt: string
  readonly filledAt?: string
}

/** A refused code request: the message is the sentence the screen shows. */
export class CofreCodeError extends Error {}

/** What a persona opens. */
export interface OpenCodeRequestInput {
  readonly projectId: string
  readonly personaId: string
  readonly reason: string
  readonly ticketId?: string
  /** The login the code is for (site or service), as the persona said it; truncated, never a secret. */
  readonly site?: string
}

/** Stored request; the digits are never here. */
interface StoredCodeRequest {
  readonly id: string
  readonly projectId: string
  readonly personaId: string
  readonly ticketId?: string
  readonly reason: string
  readonly site?: string
  readonly state: 'pending' | 'filled' | 'taken' | 'cancelled'
  readonly createdAt: string
  readonly expiresAt: string
  readonly filledAt?: string
}

/** What the requests need from the host. */
export interface CofreCodesDeps {
  readonly screens: ScreenRepos
  readonly secrets: CofreSecrets
  readonly now?: () => string
  readonly newId?: () => string
  readonly ttlMs?: number
  /** Carbon P1-04: the owner filled a request (the view carries the state, never the digits): the host wakes the persona's Task. */
  readonly onFilled?: (view: CofreCodeRequestView) => void
}

/**
 * The 2FA code requests of every project.
 */
export class CofreCodes {
  private readonly deps: CofreCodesDeps
  private readonly nowMs: () => number
  private readonly now: () => string
  private readonly newId: () => string
  private readonly ttlMs: number

  /**
   * @param deps - Store, sealed slots and clock.
   */
  constructor(deps: CofreCodesDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => new Date().toISOString())
    this.nowMs = () => Date.parse(this.now())
    this.newId = deps.newId ?? (() => randomUUID())
    this.ttlMs = deps.ttlMs ?? CODE_REQUEST_TTL_MS
  }

  /**
   * Open a request for the owner; the card is the caller's (the screen shows it).
   * @param input - Who needs it and why.
   * @returns The pending request.
   */
  open(input: OpenCodeRequestInput): CofreCodeRequestView {
    const reason = input.reason.trim()
    if (reason === '') throw new CofreCodeError('Diga para que serve o código.')
    const site = input.site?.trim().slice(0, 60) ?? ''
    const createdAt = this.now()
    const request: StoredCodeRequest = {
      id: `cofre-code-${this.newId()}`,
      projectId: input.projectId,
      personaId: input.personaId,
      ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
      reason,
      ...(site === '' ? {} : { site }),
      state: 'pending',
      createdAt,
      expiresAt: new Date(this.nowMs() + this.ttlMs).toISOString(),
    }
    this.deps.screens.put(input.projectId, COFRE_CODE_DOC, request.id, request)
    return this.view(request)
  }

  /**
   * The owner fills the six digits.
   * @param projectId - Tenant.
   * @param id - Request id.
   * @param code - The six digits; anything else is refused.
   * @returns The filled request.
   */
  async fill(projectId: string, id: string, code: string): Promise<CofreCodeRequestView> {
    const request = this.stored(projectId, id)
    const state = this.stateOf(request)
    if (state === 'expired') throw new CofreCodeError('Este pedido de código expirou. Abra outro.')
    if (state === 'cancelled') throw new CofreCodeError('Este pedido de código foi cancelado.')
    if (state === 'filled' || state === 'taken') throw new CofreCodeError('Este código já foi preenchido.')
    const digits = code.trim()
    if (!/^\d{6}$/u.test(digits)) throw new CofreCodeError('O código tem 6 números. Confira e preencha de novo.')
    await this.deps.secrets.put(projectId, `code:${id}`, digits)
    const filled: StoredCodeRequest = { ...request, state: 'filled', filledAt: this.now() }
    this.deps.screens.put(projectId, COFRE_CODE_DOC, id, filled)
    const view = this.view(filled)
    try { this.deps.onFilled?.(view) } catch (error) { void error } // waking the Task is the host's business: it never undoes the fill
    return view
  }

  /**
   * Read the digits ONCE, for the host's own use (typing into the browser). Never a model-facing path.
   * @param projectId - Tenant.
   * @param id - Request id.
   * @returns The six digits, or undefined when nothing is filled (or it expired).
   */
  async take(projectId: string, id: string): Promise<string | undefined> {
    const request = this.stored(projectId, id)
    if (this.stateOf(request) !== 'filled') {
      // A filled code nobody used in time is never handed over, and its digits do not stay sealed.
      if (request.state === 'filled') await this.dropSecret(projectId, id)
      return undefined
    }
    const digits = await this.deps.secrets.read(projectId, `code:${id}`)
    await this.deps.secrets.drop(projectId, `code:${id}`)
    this.deps.screens.put(projectId, COFRE_CODE_DOC, id, { ...request, state: 'taken' })
    return digits
  }

  /**
   * Read the digits WITHOUT spending them: the host types them into the page first and only then {@link CofreCodes.take}s them, so a page that had no field for them does not burn the owner's code.
   * Host-only, never a model-facing path.
   * @param projectId - Tenant.
   * @param id - Request id.
   * @returns The six digits, or undefined when the request is not filled (or it expired).
   */
  async peek(projectId: string, id: string): Promise<string | undefined> {
    const request = this.stored(projectId, id)
    if (this.stateOf(request) !== 'filled') return undefined
    return this.deps.secrets.read(projectId, `code:${id}`)
  }

  /**
   * The newest request a persona's Task has that the owner already filled and nobody used.
   * @param projectId - Tenant.
   * @param who - The persona and the Task that asked.
   * @returns The request (never the digits), or undefined.
   */
  filledFor(projectId: string, who: { readonly personaId: string; readonly ticketId: string }): CofreCodeRequestView | undefined {
    return this.list(projectId)
      .filter(request => request.personaId === who.personaId && request.ticketId === who.ticketId && request.state === 'filled')
      .sort((a, b) => (b.filledAt ?? '').localeCompare(a.filledAt ?? ''))[0]
  }

  /**
   * The requests of ONE Task that still wait for the owner (nothing filled yet, not expired): while one is open the Task WAITS for it (Carbon P1-02), it is not done.
   * @param projectId - Tenant.
   * @param ticketId - The Task.
   * @returns The pending requests of the Task, oldest first.
   */
  pendingFor(projectId: string, ticketId: string): readonly CofreCodeRequestView[] {
    return this.list(projectId).filter(request => request.ticketId === ticketId && request.state === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  /**
   * The owner cancels a request: the digits she may already have filled do not stay sealed.
   * @param projectId - Tenant.
   * @param id - Request id.
   */
  async cancel(projectId: string, id: string): Promise<void> {
    const request = this.stored(projectId, id)
    this.deps.screens.put(projectId, COFRE_CODE_DOC, id, { ...request, state: 'cancelled' })
    await this.dropSecret(projectId, id)
  }

  /**
   * Drop the sealed digits of every filled request that expired and of every cancelled one (nothing else is touched).
   * @param projectId - Tenant.
   * @returns How many sealed slots were dropped.
   */
  async sweep(projectId: string): Promise<number> {
    let dropped = 0
    for (const request of this.deps.screens.list<StoredCodeRequest>(projectId, COFRE_CODE_DOC)) {
      const dead = request.state === 'cancelled' || (request.state === 'filled' && this.stateOf(request) === 'expired')
      if (dead && this.deps.secrets.has(projectId, `code:${request.id}`)) {
        await this.dropSecret(projectId, request.id)
        dropped += 1
      }
    }
    return dropped
  }

  private async dropSecret(projectId: string, id: string): Promise<void> {
    try { await this.deps.secrets.drop(projectId, `code:${id}`) } catch (error) { void error } // an empty slot is already what was wanted
  }

  /**
   * @param projectId - Tenant.
   * @returns Every request of the project, newest first, with the state computed by the clock.
   */
  list(projectId: string): readonly CofreCodeRequestView[] {
    return this.deps.screens.list<StoredCodeRequest>(projectId, COFRE_CODE_DOC).map(request => this.view(request))
  }

  /**
   * @param projectId - Tenant.
   * @param id - Request id.
   * @returns The request, or undefined.
   */
  get(projectId: string, id: string): CofreCodeRequestView | undefined {
    const request = this.deps.screens.get<StoredCodeRequest>(projectId, COFRE_CODE_DOC, id)
    return request === undefined ? undefined : this.view(request)
  }

  private stored(projectId: string, id: string): StoredCodeRequest {
    const request = this.deps.screens.get<StoredCodeRequest>(projectId, COFRE_CODE_DOC, id)
    if (request === undefined) throw new CofreCodeError('Este pedido de código não existe mais.')
    return request
  }

  private stateOf(request: StoredCodeRequest): CofreCodeState {
    if (request.state === 'pending' && this.nowMs() > Date.parse(request.expiresAt)) return 'expired'
    // A filled code stays usable for the same time a request waits, counted from the fill (the owner may fill at the last minute).
    if (request.state === 'filled' && request.filledAt !== undefined && this.nowMs() > Date.parse(request.filledAt) + this.ttlMs) return 'expired'
    return request.state
  }

  private view(request: StoredCodeRequest): CofreCodeRequestView {
    return {
      id: request.id,
      projectId: request.projectId,
      personaId: request.personaId,
      ...(request.ticketId === undefined ? {} : { ticketId: request.ticketId }),
      reason: request.reason,
      ...(request.site === undefined ? {} : { site: request.site }),
      state: this.stateOf(request),
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      ...(request.filledAt === undefined ? {} : { filledAt: request.filledAt }),
    }
  }
}
