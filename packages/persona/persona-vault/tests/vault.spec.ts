import { describe, expect, it } from 'vitest'
import {
  INVITE_TOKEN_PROVIDER,
  assertNoPlaintextSecrets,
  createIpcVaultCipher,
  createMemoryCipher,
  createPersonaVault,
  dropInviteToken,
  openInviteToken,
  PACKAGE_VAULT,
  sealInviteToken,
  VAULT_SCOPE,
} from '../src/index.ts'

describe('persona-vault', () => {
  it('persona-vault skeleton loads', () => {
    expect(PACKAGE_VAULT).toBe('persona-vault')
    expect(VAULT_SCOPE).toBe('persona-vault')
  })

  it('stores only sealed blobs and never the plaintext secret', async () => {
    const vault = createPersonaVault(createMemoryCipher())
    await vault.set('atlas', 'dsh', 'sk-live-super-secret')
    const snapshot = vault.list()
    expect(snapshot.connections).toHaveLength(1)
    expect(snapshot.connections[0]?.sealed).not.toBe('sk-live-super-secret')
    expect(() => assertNoPlaintextSecrets(snapshot, ['sk-live-super-secret'])).not.toThrow()
    expect(await vault.get('atlas', 'dsh')).toBe('sk-live-super-secret')
    await vault.unset('atlas', 'dsh')
    expect(await vault.get('atlas', 'dsh')).toBeUndefined()
  })

  it('fails a scan when plaintext is left in the snapshot', () => {
    expect(() => assertNoPlaintextSecrets({
      connections: [{ personId: 'atlas', provider: 'dsh', sealed: 'sk-live-super-secret' }],
    }, ['sk-live-super-secret'])).toThrow(/plaintext secret leaked/u)
  })

  it('seals and opens through an IPC transport (main/safeStorage stand-in)', async () => {
    const calls: string[] = []
    const vault = createPersonaVault(createIpcVaultCipher({
      request: async (op, payload) => {
        calls.push(op)
        return op === 'seal' ? `sealed:${payload}` : payload.replace(/^sealed:/u, '')
      },
    }))
    await vault.set('nina', 'dsh', 'key-nina')
    expect(calls).toEqual(['seal'])
    expect(vault.list().connections[0]?.sealed).toBe('sealed:key-nina')
    expect(await vault.get('nina', 'dsh')).toBe('key-nina')
    expect(calls).toEqual(['seal', 'open'])
  })

  it('seals invite tokens without leaving plaintext in the snapshot', async () => {
    const vault = createPersonaVault(createMemoryCipher())
    await sealInviteToken(vault, 'inv-1', 'tok-live-invite')
    expect(vault.list().connections[0]?.provider).toBe(INVITE_TOKEN_PROVIDER)
    expect(() => assertNoPlaintextSecrets(vault.list(), ['tok-live-invite'])).not.toThrow()
    expect(await openInviteToken(vault, 'inv-1')).toBe('tok-live-invite')
    await dropInviteToken(vault, 'inv-1')
    expect(await openInviteToken(vault, 'inv-1')).toBeUndefined()
  })
})
