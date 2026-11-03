/** Main-process DPAPI via Electron `safeStorage` for host vault requests (D4a). */

import { safeStorage } from 'electron'

export const PERSONA_VAULT_IPC = 'persona-vault' as const

export interface PersonaVaultHostRequest {
  readonly type: typeof PERSONA_VAULT_IPC
  readonly requestId: number
  readonly op: 'seal' | 'open'
  readonly payload: string
}

export interface PersonaVaultHostResponse {
  readonly type: typeof PERSONA_VAULT_IPC
  readonly requestId: number
  readonly payload?: string
  readonly error?: string
}

export function isPersonaVaultHostRequest(message: unknown): message is PersonaVaultHostRequest {
  if (typeof message !== 'object' || message === null) return false
  const row = message as Record<string, unknown>
  return row.type === PERSONA_VAULT_IPC
    && Number.isSafeInteger(row.requestId)
    && (row.op === 'seal' || row.op === 'open')
    && typeof row.payload === 'string'
}

/**
 * Seal or open a secret with the OS credential store (DPAPI on Windows).
 * @param request - host IPC request. Payload must never be logged.
 */
export function handlePersonaVaultRequest(request: PersonaVaultHostRequest): PersonaVaultHostResponse {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { type: PERSONA_VAULT_IPC, requestId: request.requestId, error: 'safeStorage unavailable' }
    }
    if (request.op === 'seal') {
      return {
        type: PERSONA_VAULT_IPC,
        requestId: request.requestId,
        payload: safeStorage.encryptString(request.payload).toString('base64'),
      }
    }
    return {
      type: PERSONA_VAULT_IPC,
      requestId: request.requestId,
      payload: safeStorage.decryptString(Buffer.from(request.payload, 'base64')),
    }
  } catch (error) {
    return {
      type: PERSONA_VAULT_IPC,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : 'vault failed',
    }
  }
}
