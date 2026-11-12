import { describe, expect, it } from 'vitest'
import {
  COFRE_OWNER,
  CofreSecrets,
  assertNoPlaintextSecrets,
  createMemoryCipher,
  createPersonaVault,
} from '../src/index.ts'

describe('Cofre sealed slots', () => {
  it('seals a login password and never leaves the plaintext in the snapshot', async () => {
    const vault = createPersonaVault(createMemoryCipher())
    const cofre = new CofreSecrets(vault)
    await cofre.put('pp', 'login-1', 'senha-da-padaria')
    expect(await cofre.read('pp', 'login-1')).toBe('senha-da-padaria')
    expect(() => assertNoPlaintextSecrets(vault.list(), ['senha-da-padaria'])).not.toThrow()
    expect(vault.list().connections[0]?.personId).toBe(COFRE_OWNER)
    expect(cofre.has('pp', 'login-1')).toBe(true)
    expect(cofre.ids('pp')).toEqual(['login-1'])
    await cofre.drop('pp', 'login-1')
    expect(await cofre.read('pp', 'login-1')).toBeUndefined()
    expect(cofre.has('pp', 'login-1')).toBe(false)
  })

  it('answers presence without decrypting and keeps tenants apart', async () => {
    const vault = createPersonaVault({
      seal: async value => `sealed:${value}`,
      open: () => Promise.reject(new Error('must not decrypt')),
    })
    const cofre = new CofreSecrets(vault)
    await cofre.put('pp', 'key-1', 'sk-abc')
    expect(cofre.has('pp', 'key-1')).toBe(true)
    expect(cofre.ids('pp')).toEqual(['key-1'])
    expect(cofre.ids('other')).toEqual([])
    expect(cofre.has('other', 'key-1')).toBe(false)
  })

  it('refuses an empty secret', async () => {
    const cofre = new CofreSecrets(createPersonaVault(createMemoryCipher()))
    await expect(cofre.put('pp', 'login-1', '')).rejects.toThrow('empty secret')
  })
})
