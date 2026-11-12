/**
 * H23 (host): the device identity is kept in the Cofre's sealed slot. Created once, read back identical, never replaced when the slot is damaged, closed without DPAPI, and it
 * appears in NO screen document or event. The unit half uses a fake slot store; the host half uses the real Cofre of a host (the test cipher).
 */
import { VaultUnavailableError, type CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import { generateIdentity, loadOrCreateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { CofreIdentityStore, E2EE_IDENTITY_ENTRY, E2EE_TENANT, IdentityCorruptError, IdentityUnavailableError } from '../src/e2ee-identity.ts'
import { it } from './journeys/journey-host.ts'
import { openRemoteTeamHarness } from './remote-team-harness.ts'

beforeEach(() => { vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1') })
afterEach(() => { vi.unstubAllEnvs() })

/** The few methods of `CofreSecrets` the store uses, in memory. */
class FakeSlots {
  readonly rows = new Map<string, string>()
  broken = false
  has(tenant: string, entry: string): boolean { return this.rows.has(`${tenant}/${entry}`) }
  read(tenant: string, entry: string): Promise<string | undefined> { return Promise.resolve(this.rows.get(`${tenant}/${entry}`)) }
  put(tenant: string, entry: string, secret: string): Promise<void> {
    if (this.broken) return Promise.reject(new VaultUnavailableError())
    this.rows.set(`${tenant}/${entry}`, secret)
    return Promise.resolve()
  }
}
const asSecrets = (slots: FakeSlots): CofreSecrets => slots as unknown as CofreSecrets
const SLOT = `${E2EE_TENANT}/${E2EE_IDENTITY_ENTRY}`

describe('the identity slot', () => {
  it('is created once, kept in ONE slot of the device tenant, and read back identical', async () => {
    const slots = new FakeSlots()
    const store = new CofreIdentityStore(asSecrets(slots))
    expect(await store.load()).toBeUndefined()
    const first = await loadOrCreateIdentity(store)
    expect([...slots.rows.keys()]).toEqual([SLOT])
    expect(await loadOrCreateIdentity(store)).toEqual(first)
    expect(await new CofreIdentityStore(asSecrets(slots)).load()).toEqual(first) // another process, same slot
  })

  it('a damaged slot is never replaced: loading throws, so no new identity can overwrite the old keys', async () => {
    const slots = new FakeSlots()
    slots.rows.set(SLOT, '{"signing":{"publicKey":"curta"}}')
    const store = new CofreIdentityStore(asSecrets(slots))
    await expect(store.load()).rejects.toBeInstanceOf(IdentityCorruptError)
    await expect(loadOrCreateIdentity(store)).rejects.toBeInstanceOf(IdentityCorruptError)
    expect(slots.rows.get(SLOT)).toBe('{"signing":{"publicKey":"curta"}}')
    slots.rows.set(SLOT, 'isto não é JSON')
    await expect(store.load()).rejects.toBeInstanceOf(IdentityCorruptError)
  })

  it('without DPAPI (the Cofre refuses) no identity is created, and the error says so in plain words', async () => {
    const slots = new FakeSlots()
    slots.broken = true
    await expect(loadOrCreateIdentity(new CofreIdentityStore(asSecrets(slots)))).rejects.toBeInstanceOf(IdentityUnavailableError)
    expect(slots.rows.size).toBe(0)
    expect(new IdentityUnavailableError().message).toMatch(/Cofre indisponível/u)
  })
})

describe('in a real host', () => {
  it('the identity goes into the real Cofre, comes back identical, and its secrets are in no screen document or event', async () => {
    const { h, dispose } = openRemoteTeamHarness('') // a host with the REAL Cofre (the vault plugin, test cipher)
    try {
      const store = new CofreIdentityStore(h.cofreSecrets)
      const identity = await loadOrCreateIdentity(store)
      expect(await new CofreIdentityStore(h.cofreSecrets).load()).toEqual(identity)
      expect(h.cofreSecrets.has(E2EE_TENANT, E2EE_IDENTITY_ENTRY)).toBe(true)
      const everything = JSON.stringify({ documents: h.store.db.prepare('SELECT body FROM screen_doc').all(), events: h.store.db.prepare('SELECT body FROM event').all() })
      expect(everything).not.toContain(identity.signing.seed)
      expect(everything).not.toContain(identity.agreement.secret)
      expect(publicIdentity(identity)).toEqual({ signing: identity.signing.publicKey, agreement: identity.agreement.publicKey })
      expect(publicIdentity(generateIdentity()).signing).not.toBe(identity.signing.publicKey)
    } finally {
      await dispose()
    }
  })
})
