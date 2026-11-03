/** Encrypt/decrypt port. Main implements this with Electron `safeStorage` (DPAPI on Windows). */

/** Opaque ciphertext produced by a {@link VaultCipher}. Never log or prompt this as if it were plaintext. */
export type SealedSecret = string

/** One-way secret transform used by the vault. */
export interface VaultCipher {
  seal(plaintext: string): Promise<SealedSecret>
  open(sealed: SealedSecret): Promise<string>
}

/**
 * In-memory cipher for tests. Not DPAPI — production must use {@link createIpcVaultCipher}.
 */
export function createMemoryCipher(): VaultCipher {
  return {
    seal: async plaintext => Buffer.from(plaintext, 'utf8').toString('base64'),
    open: async sealed => Buffer.from(sealed, 'base64').toString('utf8'),
  }
}

export interface IpcVaultTransport {
  request(op: 'seal' | 'open', payload: string): Promise<string>
}

/**
 * Cipher that asks Electron main to run `safeStorage` (host is RunAsNode).
 * @param transport - request/response over the main↔host IPC channel.
 */
export function createIpcVaultCipher(transport: IpcVaultTransport): VaultCipher {
  return {
    seal: async plaintext => transport.request('seal', plaintext),
    open: async sealed => transport.request('open', sealed),
  }
}
