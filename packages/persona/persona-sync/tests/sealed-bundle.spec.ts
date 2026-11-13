import { describe, expect, it } from 'vitest'
import { newChannelKey, sealChannel, wrapChannelKey } from '../src/channel-crypto.ts'
import { generateIdentity, publicIdentity } from '../src/keys.ts'
import {
  BUNDLE_MAX_BYTES, BUNDLE_MAX_ITEMS, BUNDLE_MAX_TEXT, BUNDLE_SCHEMA, BUNDLE_TTL_MS, BundleError, bundleDigest, cleanBundle, newBundleId, openPersonaBundle, sealPersonaBundle,
  type BundleRefusal, type OpenBundleInput, type PersonaBundle, type SealedBundle,
} from '../src/sealed-bundle.ts'

/**
 * D-116: the persona bundle. Sealed for ONE computer with the E2EE of item 23 (wrap + seal, signed by the sender), a closed schema, no credential-shaped text, no private DM memory unless the creator said so,
 * bound to persona, workspace, epoch, sender and recipient, with a deadline and a replay guard.
 */
const NOW = 1_800_000_000_000
const A = generateIdentity() // the computer she lives on today
const B = generateIdentity() // the destination
const C = generateIdentity() // a third computer of the team
const A_ID = 'comp-a'
const B_ID = 'comp-b'
const C_ID = 'comp-c'

const base = (over: Partial<PersonaBundle> = {}): PersonaBundle => ({
  schema: BUNDLE_SCHEMA, id: newBundleId(), personaId: 'nina', workspaceId: 'ws1', fromComputerId: A_ID, toComputerId: B_ID, epoch: 4,
  createdAt: new Date(NOW).toISOString(), notAfter: new Date(NOW + BUNDLE_TTL_MS).toISOString(), includesPrivateDm: false,
  sheet: { json: '{"name":"Nina"}', signature: 'c2ln', signerSigningPublic: A.signing.publicKey },
  memory: [{ id: 'm1', kind: 'note', title: 'Cliente Ana', body: 'A Ana gosta de bolo de cenoura sem cobertura.', updatedAt: '2026-11-10T10:00:00.000Z' }],
  rules: [{ id: 'r1', text: 'Responda sempre em português, em uma frase curta.' }],
  skills: [{ name: 'orcamento', files: [{ path: 'SKILL.md', text: '# Orçamento\nPasso a passo.' }, { path: 'refs/tabela.md', text: 'bolo: 40' }] }],
  ...over,
})
const seal = (bundle: PersonaBundle = base()): { sealed: SealedBundle; digest: string } => sealPersonaBundle({ bundle, fromSigningSeed: A.signing.seed, toAgreementPublic: publicIdentity(B).agreement })
const receive = (over: Partial<OpenBundleInput> = {}): OpenBundleInput => ({
  myComputerId: B_ID, myAgreement: { secret: B.agreement.secret, publicKey: B.agreement.publicKey }, senderSigningPublic: A.signing.publicKey,
  expected: { personaId: 'nina', workspaceId: 'ws1', epoch: 4, from: A_ID }, now: () => NOW + 60_000, ...over,
})
const refusal = (run: () => unknown): BundleRefusal | 'none' | 'other' => { try { run(); return 'none' } catch (error) { return error instanceof BundleError ? error.code : 'other' } }

describe('the sealed bundle (the E2EE of item 23)', () => {
  it('only the destination opens it, and gets back exactly what was sealed; the digest is the acknowledgement', () => {
    const { sealed, digest } = seal()
    const opened = openPersonaBundle(receive(), sealed)
    expect(opened.bundle.memory[0]?.body).toBe('A Ana gosta de bolo de cenoura sem cobertura.')
    expect(opened.bundle.skills[0]?.files.map(file => file.path)).toEqual(['SKILL.md', 'refs/tabela.md'])
    expect(opened.digest).toBe(digest)
    expect(digest).toBe(bundleDigest(base({ id: opened.bundle.id })))
  })

  it('nothing of the memory, the rules or the skills is readable in what travels', () => {
    const wire = JSON.stringify(seal().sealed)
    for (const secretText of ['cenoura', 'Responda sempre', 'Orçamento', 'bolo: 40', 'Nina', 'Cliente Ana']) expect(wire, secretText).not.toContain(secretText)
  })

  it('another computer cannot open it: not by its id, and not by pretending to be the destination', () => {
    const { sealed } = seal()
    expect(refusal(() => openPersonaBundle(receive({ myComputerId: C_ID, myAgreement: { secret: C.agreement.secret, publicKey: C.agreement.publicKey } }), sealed))).toBe('not-for-me')
    expect(refusal(() => openPersonaBundle(receive({ myAgreement: { secret: C.agreement.secret, publicKey: C.agreement.publicKey } }), sealed))).toBe('bad-wrap') // C\'s key under B's id
  })

  it('the sender is whoever its CERTIFICATE says: a bundle verified against another key is refused, a forged signature too', () => {
    const { sealed } = seal()
    expect(refusal(() => openPersonaBundle(receive({ senderSigningPublic: C.signing.publicKey }), sealed))).toBe('bad-wrap')
    const forger = sealPersonaBundle({ bundle: base(), fromSigningSeed: C.signing.seed, toAgreementPublic: publicIdentity(B).agreement }) // C signs as "comp-a"
    expect(refusal(() => openPersonaBundle(receive(), forger.sealed))).toBe('bad-wrap')
  })

  it('a changed ciphertext or a changed wrap fails (tag and signature)', () => {
    const { sealed } = seal()
    const flip = (value: string): string => `${value.slice(0, 20)}${value[20] === 'A' ? 'B' : 'A'}${value.slice(21)}`
    expect(refusal(() => openPersonaBundle(receive(), { ...sealed, sealed: { ...sealed.sealed, ciphertext: flip(sealed.sealed.ciphertext) } }))).toBe('bad-signature')
    expect(refusal(() => openPersonaBundle(receive(), { ...sealed, wrap: { ...sealed.wrap, ct: flip(sealed.wrap.ct) } }))).toBe('bad-wrap')
    expect(refusal(() => openPersonaBundle(receive(), { ...sealed, sealed: { ...sealed.sealed, sig: flip(sealed.sealed.sig) } }))).toBe('bad-signature')
  })

  it('persona, workspace, epoch and sender are bound: a bundle moved to another persona or epoch, or claiming another sender, is refused', () => {
    const { sealed } = seal()
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'outra', workspaceId: 'ws1', epoch: 4, from: A_ID } }), sealed))).toBe('wrong-persona')
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'nina', workspaceId: 'ws-outro', epoch: 4, from: A_ID } }), sealed))).toBe('wrong-persona')
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'nina', workspaceId: 'ws1', epoch: 5, from: A_ID } }), sealed))).toBe('wrong-epoch') // downgrade / replay of an old epoch
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'nina', workspaceId: 'ws1', epoch: 4, from: C_ID } }), sealed))).toBe('wrong-sender')
    // the header is only a hint: edited after sealing (and "expected" edited to match) the wrap no longer verifies
    const moved: SealedBundle = { ...sealed, header: { ...sealed.header, personaId: 'outra' } }
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'outra', workspaceId: 'ws1', epoch: 4, from: A_ID } }), moved))).toBe('bad-wrap')
    const lower: SealedBundle = { ...sealed, header: { ...sealed.header, epoch: 3 }, wrap: { ...sealed.wrap, epoch: 3 } }
    expect(refusal(() => openPersonaBundle(receive({ expected: { personaId: 'nina', workspaceId: 'ws1', epoch: 3, from: A_ID } }), lower))).toBe('bad-wrap')
  })

  it('a bundle is worth 24 hours; a repeat is refused', () => {
    const { sealed } = seal()
    expect(refusal(() => openPersonaBundle(receive({ now: () => NOW + BUNDLE_TTL_MS - 1 }), sealed))).toBe('none')
    expect(refusal(() => openPersonaBundle(receive({ now: () => NOW + BUNDLE_TTL_MS }), sealed))).toBe('expired')
    expect(refusal(() => openPersonaBundle(receive({ now: () => NOW + 10 * BUNDLE_TTL_MS }), sealed))).toBe('expired')
    const seen = new Set<string>()
    const first = openPersonaBundle(receive({ alreadySeen: id => seen.has(id) }), sealed)
    seen.add(first.bundle.id)
    expect(refusal(() => openPersonaBundle(receive({ alreadySeen: id => seen.has(id) }), sealed))).toBe('replayed')
  })

  it('every seal is a fresh key and nonce (the same bundle sealed twice looks different)', () => {
    const bundle = base()
    const one = JSON.stringify(seal(bundle).sealed)
    const two = JSON.stringify(seal(bundle).sealed)
    expect(one).not.toBe(two)
  })
})

describe('what a bundle may carry (the closed schema, at BOTH ends)', () => {
  const forge = (plain: unknown): SealedBundle => { // a sender that skipped its own checks: the receiver must still refuse
    const key = newChannelKey()
    const epoch = 4
    const channelId = 'persona-bundle:nina'
    const sealed = sealChannel({ workspaceId: 'ws1', streamId: channelId, epoch, authorId: A_ID, key, signingSeed: A.signing.seed, plaintext: JSON.stringify(plain) })
    const wrap = wrapChannelKey({ workspaceId: 'ws1', channelId, epoch, recipientId: B_ID, by: A_ID }, { key, recipientAgreementPublic: publicIdentity(B).agreement, signingSeed: A.signing.seed })
    return { header: { personaId: 'nina', workspaceId: 'ws1', from: A_ID, to: B_ID, epoch }, wrap, sealed }
  }

  it('an unknown field is refused anywhere (top level, memory, rules, skills, files, sheet): the schema is a closed list', () => {
    const extras: Record<string, PersonaBundle> = {
      top: { ...base(), credentials: { token: 'x' } } as unknown as PersonaBundle,
      memory: base({ memory: [{ id: 'm', kind: 'note', body: 'x', updatedAt: 'u', accountId: 'acc' } as never] }),
      rule: base({ rules: [{ id: 'r', text: 'x', secret: 'y' } as never] }),
      skill: base({ skills: [{ name: 's', files: [], run: 'rm -rf' } as never] }),
      file: base({ skills: [{ name: 's', files: [{ path: 'a.md', text: 'x', mode: '777' } as never] }] }),
      sheet: base({ sheet: { json: '{}', signature: 'x', signerSigningPublic: 'k', seed: 's' } as never }),
    }
    for (const [name, bundle] of Object.entries(extras)) {
      expect(refusal(() => seal(bundle)), `send ${name}`).toBe('schema')
      expect(refusal(() => openPersonaBundle(receive(), forge(bundle))), `receive ${name}`).toBe('schema')
    }
    expect(refusal(() => seal({ ...base(), schema: 'persona-bundle/v2' } as unknown as PersonaBundle))).toBe('schema')
  })

  it('a credential-shaped text is refused wherever it hides (memory, title, rules, skill files, the sheet), and the error never carries it', () => {
    const shapes = [
      'sk-abcdefghijklmnopqrstuvwx1234', '-----BEGIN OPENSSH PRIVATE KEY-----', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456', 'api_key = abcdefgh12345678', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'xoxb-1234567890-abcdefghij', 'AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    ]
    for (const shape of shapes) {
      const places: PersonaBundle[] = [
        base({ memory: [{ id: 'm', kind: 'note', body: `anote ${shape} aqui`, updatedAt: 'u' }] }),
        base({ memory: [{ id: 'm', kind: 'note', title: shape, body: 'x', updatedAt: 'u' }] }),
        base({ rules: [{ id: 'r', text: shape }] }),
        base({ skills: [{ name: 's', files: [{ path: 'a.md', text: shape }] }] }),
        base({ sheet: { json: shape, signature: 'x', signerSigningPublic: 'k' } }),
      ]
      for (const bundle of places) {
        expect(refusal(() => seal(bundle)), shape).toBe('secret-detected')
        expect(refusal(() => openPersonaBundle(receive(), forge(bundle))), `receive ${shape}`).toBe('secret-detected')
      }
      try { seal(places[0] as PersonaBundle) } catch (error) { expect((error as Error).message).not.toContain(shape) }
    }
  })

  it('ordinary memory passes (the scan stops the obvious, it does not block a note that says "a senha do wifi é azul")', () => {
    const ok = base({ memory: [{ id: 'm', kind: 'note', body: 'A senha do wifi do ateliê é azul (ela só usa em reunião). Chave Pix: o CNPJ.', updatedAt: 'u' }] })
    expect(refusal(() => seal(ok))).toBe('none')
  })

  it('a skill file path that leaves its folder, or hides, is refused', () => {
    for (const path of ['../x', '/etc/passwd', 'a/../b', '.env', 'a/.git/config', 'a\\b', 'C:/x', '', 'a//b', 'a/ b', 'x'.repeat(201)]) {
      const bundle = base({ skills: [{ name: 's', files: [{ path, text: 'x' }] }] })
      expect(refusal(() => seal(bundle)), JSON.stringify(path)).toBe('bad-path')
      expect(refusal(() => openPersonaBundle(receive(), forge(bundle))), `receive ${JSON.stringify(path)}`).toBe('bad-path')
    }
  })

  it('caps: too many items, one text too long, too many skills or files, and the whole bundle past its size', () => {
    const item = (index: number): PersonaBundle['memory'][number] => ({ id: `m${String(index)}`, kind: 'note', body: 'x', updatedAt: 'u' })
    expect(refusal(() => seal(base({ memory: Array.from({ length: BUNDLE_MAX_ITEMS + 1 }, (_, index) => item(index)) })))).toBe('too-big')
    expect(refusal(() => seal(base({ memory: [{ id: 'm', kind: 'note', body: 'x'.repeat(BUNDLE_MAX_TEXT + 1), updatedAt: 'u' }] })))).toBe('too-big')
    expect(refusal(() => seal(base({ skills: Array.from({ length: 101 }, (_, index) => ({ name: `s${String(index)}`, files: [] })) })))).toBe('too-big')
    expect(refusal(() => seal(base({ skills: [{ name: 's', files: Array.from({ length: 201 }, (_, index) => ({ path: `f${String(index)}.md`, text: 'x' })) }] })))).toBe('too-big')
    const heavy = Array.from({ length: Math.ceil(BUNDLE_MAX_BYTES / BUNDLE_MAX_TEXT) + 4 }, (_, index) => ({ id: `m${String(index)}`, kind: 'note' as const, body: 'x'.repeat(BUNDLE_MAX_TEXT), updatedAt: 'u' }))
    expect(refusal(() => seal(base({ memory: heavy })))).toBe('too-big')
  })

  it('PRIVATE DM memory does not travel unless the creator confirmed it (the operator of the destination can read what it holds)', () => {
    const withPrivate = (confirmed: boolean): PersonaBundle => base({ includesPrivateDm: confirmed, memory: [{ id: 'm', kind: 'dm-rule', body: 'A Bia prefere o contrato em PDF.', updatedAt: 'u', privateDm: true }] })
    expect(refusal(() => seal(withPrivate(false)))).toBe('private-dm')
    expect(refusal(() => openPersonaBundle(receive(), forge(withPrivate(false))))).toBe('private-dm')
    expect(refusal(() => seal(withPrivate(true)))).toBe('none')
  })

  it('cleanBundle rebuilds from the allowed fields only and rejects what is not a bundle', () => {
    expect(cleanBundle(base()).rules).toHaveLength(1)
    for (const bad of [null, 5, 'x', [], {}, { schema: BUNDLE_SCHEMA }]) expect(refusal(() => cleanBundle(bad)), JSON.stringify(bad)).toBe('schema')
    expect(refusal(() => cleanBundle({ ...base(), epoch: -1 }))).toBe('schema')
    expect(refusal(() => cleanBundle({ ...base(), epoch: 1.5 }))).toBe('schema')
    expect(refusal(() => cleanBundle({ ...base(), includesPrivateDm: 'yes' }))).toBe('schema')
    expect(refusal(() => cleanBundle({ ...base(), personaId: 'bad id with spaces' }))).toBe('schema')
  })

  it('no credential field exists in the schema at all (the closed list has no place for a token, a key, an account or a session)', () => {
    const fields = JSON.stringify(Object.keys(base())) + JSON.stringify(Object.keys(base().sheet))
    for (const forbidden of ['token', 'secret', 'password', 'credential', 'cookie', 'session', 'accountId', 'apiKey', 'seed']) expect(fields.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    const forgedIdentity = { ...base(), seed: A.signing.seed } as unknown as PersonaBundle // a private seed riding along
    expect(refusal(() => seal(forgedIdentity))).toBe('schema')
  })
})
