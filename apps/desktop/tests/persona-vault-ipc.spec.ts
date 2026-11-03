import { afterEach, describe, expect, it, vi } from 'vitest'

const encrypt = vi.fn((value: string) => Buffer.from(`enc:${value}`))
const decrypt = vi.fn((value: Buffer) => value.toString('utf8').replace(/^enc:/u, ''))
const available = vi.fn(() => true)

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => available(),
    encryptString: (value: string) => encrypt(value),
    decryptString: (value: Buffer) => decrypt(value),
  },
}))

afterEach(() => {
  encrypt.mockClear()
  decrypt.mockClear()
  available.mockReset()
  available.mockReturnValue(true)
})

describe('persona vault IPC', () => {
  it('seals and opens through safeStorage without echoing plaintext in the error path', async () => {
    const { handlePersonaVaultRequest, isPersonaVaultHostRequest } = await import('../src/persona-vault-ipc.ts')
    const sealed = handlePersonaVaultRequest({ type: 'persona-vault', requestId: 1, op: 'seal', payload: 'sk-secret' })
    expect(sealed.payload).toBe(Buffer.from('enc:sk-secret').toString('base64'))
    expect(sealed.error).toBeUndefined()
    const opened = handlePersonaVaultRequest({
      type: 'persona-vault',
      requestId: 2,
      op: 'open',
      payload: sealed.payload ?? '',
    })
    expect(opened.payload).toBe('sk-secret')
    expect(isPersonaVaultHostRequest({ type: 'persona-vault', requestId: 3, op: 'seal', payload: 'x' })).toBe(true)
    expect(isPersonaVaultHostRequest({ type: 'ready', url: 'http://127.0.0.1' })).toBe(false)
  })

  it('reports unavailable encryption without storing the secret', async () => {
    available.mockReturnValue(false)
    const { handlePersonaVaultRequest } = await import('../src/persona-vault-ipc.ts')
    const result = handlePersonaVaultRequest({ type: 'persona-vault', requestId: 4, op: 'seal', payload: 'sk-secret' })
    expect(result.error).toBe('safeStorage unavailable')
    expect(result.payload).toBeUndefined()
    expect(encrypt).not.toHaveBeenCalled()
  })
})
