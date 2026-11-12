/**
 * H23 / F1 (Entrega 2): a person's device identity. The primitives are checked against the published test vectors (RFC 8032 Ed25519, RFC 7748 X25519), so what is
 * stored in the Cofre and what the edge verifies are the standard algorithms, byte for byte, and not "something that round-trips with itself".
 */
import { describe, expect, it } from 'vitest'
import {
  MemoryIdentityStore, agree, fingerprint, generateAgreementPair, generateIdentity, loadOrCreateIdentity, publicIdentity, signBytes, verifyBytes,
} from '../src/index.ts'

const b64u = (hex: string): string => Buffer.from(hex, 'hex').toString('base64url')
const hexOf = (base64url: string): string => Buffer.from(base64url, 'base64url').toString('hex')

describe('Ed25519 (RFC 8032 §7.1)', () => {
  const vectors = [
    {
      name: 'TEST 1 (empty message)',
      seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
      pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      msg: '',
      sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    },
    {
      name: 'TEST 2 (one byte)',
      seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
      pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
      msg: '72',
      sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
    },
  ]
  for (const vector of vectors) {
    it(`${vector.name}: the seed signs to the published signature and the published public key verifies it`, () => {
      const message = Buffer.from(vector.msg, 'hex')
      expect(hexOf(signBytes(b64u(vector.seed), message))).toBe(vector.sig)
      expect(verifyBytes(b64u(vector.pub), message, b64u(vector.sig))).toBe(true)
    })
  }

  it('a signature does not verify for another message, another key or a mangled signature, and never throws', () => {
    const identity = generateIdentity()
    const other = generateIdentity()
    const signature = signBytes(identity.signing.seed, Buffer.from('olá'))
    expect(verifyBytes(identity.signing.publicKey, Buffer.from('olá'), signature)).toBe(true)
    expect(verifyBytes(identity.signing.publicKey, Buffer.from('oi'), signature)).toBe(false)
    expect(verifyBytes(other.signing.publicKey, Buffer.from('olá'), signature)).toBe(false)
    expect(verifyBytes(identity.signing.publicKey, Buffer.from('olá'), 'não é base64url!')).toBe(false)
    expect(verifyBytes('curta', Buffer.from('olá'), signature)).toBe(false)
  })
})

describe('X25519 (RFC 7748 §6.1)', () => {
  const alice = { secret: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', pub: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a' }
  const bob = { secret: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb', pub: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f' }
  const shared = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742'

  it('both sides reach the published shared secret', () => {
    expect(agree(b64u(alice.secret), b64u(bob.pub)).toString('hex')).toBe(shared)
    expect(agree(b64u(bob.secret), b64u(alice.pub)).toString('hex')).toBe(shared)
  })

  it('a generated pair agrees with itself in both directions', () => {
    const one = generateAgreementPair()
    const two = generateAgreementPair()
    expect(agree(one.secret, two.publicKey).equals(agree(two.secret, one.publicKey))).toBe(true)
  })
})

describe('identity', () => {
  it('a new identity has 32-byte keys (base64url, no padding) and the public half carries NO secret', () => {
    const identity = generateIdentity()
    for (const value of [identity.signing.publicKey, identity.signing.seed, identity.agreement.publicKey, identity.agreement.secret]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    }
    const shown = JSON.stringify(publicIdentity(identity))
    expect(shown).not.toContain(identity.signing.seed)
    expect(shown).not.toContain(identity.agreement.secret)
    expect(Object.keys(publicIdentity(identity)).sort()).toEqual(['agreement', 'signing'])
  })

  it('loadOrCreate creates ONCE and saves before returning: the second call returns the same identity', async () => {
    const store = new MemoryIdentityStore()
    const first = await loadOrCreateIdentity(store)
    expect(await store.load()).toEqual(first) // saved
    expect(await loadOrCreateIdentity(store)).toEqual(first)
  })

  it('the security code is stable, readable (5 groups of 4 hex digits) and different for every identity', () => {
    const one = generateIdentity()
    const two = generateIdentity()
    expect(fingerprint(publicIdentity(one))).toBe(fingerprint(publicIdentity(one)))
    expect(fingerprint(publicIdentity(one))).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){4}$/u)
    expect(fingerprint(publicIdentity(one))).not.toBe(fingerprint(publicIdentity(two)))
    // either key changing changes the code: swapping only the agreement key (a man in the middle) is visible
    expect(fingerprint({ ...publicIdentity(one), agreement: publicIdentity(two).agreement })).not.toBe(fingerprint(publicIdentity(one)))
  })
})
