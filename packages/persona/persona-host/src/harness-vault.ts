/**
 * Item 15, the host's half of `ask_vault_code`: the persona opens a six-digit request for the owner. The card is the screen's (it
 * reads `host.cofre.codes`); here the request is created and the model gets only its id and deadline — never a digit.
 */

import type { CofreCodes } from './cofre-2fa.ts'
import type { HarnessIdentity } from './harness-routines.ts'
import type { VaultCodePort } from './harness-ports.ts'

/** What the port needs. */
export interface VaultCodePortsDeps {
  readonly codes: CofreCodes
  /** Whether the sealed store can keep the digits: without it the card could never be filled, so the tool refuses. */
  readonly sealable: () => boolean
}

/**
 * The `ask_vault_code` port of one host.
 */
export class VaultCodePorts implements VaultCodePort {
  private readonly deps: VaultCodePortsDeps

  /**
   * @param deps - The requests and the sealed-store check.
   */
  constructor(deps: VaultCodePortsDeps) {
    this.deps = deps
  }

  /**
   * @param who - The run's identity.
   * @param input - Why, which login and which Task.
   * @returns The pending request, or the refusal sentence.
   */
  open(who: HarnessIdentity, input: { readonly reason: string; readonly login?: string; readonly ticketId?: string }):
  { readonly ok: true; readonly requestId: string; readonly expiresAt: string } | { readonly ok: false; readonly code: string; readonly message: string } {
    if (!this.deps.sealable()) {
      return { ok: false, code: 'unavailable', message: 'O Cofre não está disponível neste modo, então não consigo guardar o código com segurança. Diga ao dono, falando com ele: "preciso que você resolva o acesso ao Cofre". Depois tente de novo.' }
    }
    const reason = input.reason.trim()
    if (reason === '') return { ok: false, code: 'invalid', message: 'Diga em uma frase para que serve o código.' }
    try {
      const request = this.deps.codes.open({
        projectId: who.projectId,
        personaId: who.personaId,
        reason,
        ...(input.login === undefined ? {} : { site: input.login }),
        ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
      })
      return { ok: true, requestId: request.id, expiresAt: request.expiresAt }
    } catch (error) {
      return { ok: false, code: 'invalid', message: error instanceof Error ? error.message : 'Não consegui abrir o pedido de código.' }
    }
  }
}
