/**
 * H23 (host): this device's identity (Ed25519 signs, X25519 receives channel keys) lives in the Cofre, in ONE sealed slot (DPAPI on Windows), never in a screen document and
 * never on the edge. Only the public keys leave the device. Agreed with Zinc (12/11 01:16): tenant `e2ee-device`, entry `identity`, no metadata, so the slot shows nowhere in the
 * Cofre screen. Without DPAPI the Cofre refuses and so does this (closed, like `RemoteTeamVault`).
 */

import { VaultUnavailableError, type CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import type { Identity, IdentityStore } from '@deepseek-ai/dsh-persona-sync'

/** The Cofre tenant of device-level slots: never a project id (the host mints those). */
export const E2EE_TENANT = 'e2ee-device'
/** The entry of the identity inside it. */
export const E2EE_IDENTITY_ENTRY = 'identity'

/** The Cofre cannot seal here (no DPAPI): no identity is created, so nothing is ever kept where it could be read. */
export class IdentityUnavailableError extends Error {
  constructor() {
    super('Cofre indisponível: a identidade deste computador não pode ser guardada com segurança.')
    this.name = 'IdentityUnavailableError'
  }
}

/** A slot exists but does not hold an identity. It is NEVER replaced silently: a new identity would orphan every key wrapped for the old one. */
export class IdentityCorruptError extends Error {
  constructor() {
    super('A identidade guardada no Cofre está danificada. Não vou criar outra por cima sem você confirmar.')
    this.name = 'IdentityCorruptError'
  }
}

const KEY = /^[A-Za-z0-9_-]{43}$/u

function field(owner: unknown, name: string): string | undefined {
  const value: unknown = typeof owner === 'object' && owner !== null ? Reflect.get(owner, name) : undefined
  return typeof value === 'string' && KEY.test(value) ? value : undefined
}

function parseIdentity(text: string): Identity {
  try {
    const parsed: unknown = JSON.parse(text)
    const signing: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'signing') : undefined
    const agreement: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'agreement') : undefined
    const signingPublic = field(signing, 'publicKey')
    const signingSeed = field(signing, 'seed')
    const agreementPublic = field(agreement, 'publicKey')
    const agreementSecret = field(agreement, 'secret')
    if (signingPublic !== undefined && signingSeed !== undefined && agreementPublic !== undefined && agreementSecret !== undefined) {
      return { signing: { publicKey: signingPublic, seed: signingSeed }, agreement: { publicKey: agreementPublic, secret: agreementSecret } }
    }
  }
  catch {
    // falls through to the typed error below
  }
  throw new IdentityCorruptError()
}

/** {@link IdentityStore} over the Cofre's sealed slots. */
export class CofreIdentityStore implements IdentityStore {
  /** @param secrets - The host's sealed slots (`h.cofreSecrets`). */
  constructor(private readonly secrets: CofreSecrets) {}

  async load(): Promise<Identity | undefined> {
    if (!this.secrets.has(E2EE_TENANT, E2EE_IDENTITY_ENTRY)) return undefined
    let text: string | undefined
    try {
      text = await this.secrets.read(E2EE_TENANT, E2EE_IDENTITY_ENTRY)
    }
    catch (error: unknown) {
      if (error instanceof VaultUnavailableError) throw new IdentityUnavailableError()
      throw error
    }
    return text === undefined || text === '' ? undefined : parseIdentity(text)
  }

  async save(identity: Identity): Promise<void> {
    try {
      await this.secrets.put(E2EE_TENANT, E2EE_IDENTITY_ENTRY, JSON.stringify(identity))
    }
    catch (error: unknown) {
      if (error instanceof VaultUnavailableError) throw new IdentityUnavailableError()
      throw error
    }
  }
}
