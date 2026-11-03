/**
 * E7 invite tokens live in the vault (sealed). Never persist plaintext.
 * Friendship is not a grant — only a redeemed invite token is.
 */

import { assertNoPlaintextSecrets, type PersonaVault } from './vault.ts'

export const INVITE_TOKEN_PROVIDER = 'invite-token'

/**
 * Seal an invite token under the invite id. Snapshot stays ciphertext-only.
 * @param vault - Per-person vault.
 * @param inviteId - Invite identity (used as the vault person key).
 * @param token - Single-use token from persona-core `issueInvite`.
 */
export async function sealInviteToken(vault: PersonaVault, inviteId: string, token: string): Promise<void> {
  if (token.length === 0) throw new Error('empty invite token')
  await vault.set(inviteId, INVITE_TOKEN_PROVIDER, token)
  assertNoPlaintextSecrets(vault.list(), [token])
}

/**
 * Open a sealed invite token. Missing id returns undefined (expired/revoked locally).
 * @param vault - Per-person vault.
 * @param inviteId - Invite identity.
 */
export async function openInviteToken(vault: PersonaVault, inviteId: string): Promise<string | undefined> {
  return vault.get(inviteId, INVITE_TOKEN_PROVIDER)
}

/**
 * Drop a used, revoked, or expired token from the vault.
 * @param vault - Per-person vault.
 * @param inviteId - Invite identity.
 */
export async function dropInviteToken(vault: PersonaVault, inviteId: string): Promise<void> {
  await vault.unset(inviteId, INVITE_TOKEN_PROVIDER)
}
