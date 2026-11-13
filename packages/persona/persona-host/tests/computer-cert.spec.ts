import { describe, expect, it } from 'vitest'
import {
  ROSTER_FRESH_MS, RosterGuard, certFor, computerFingerprint, computerIdOf, effectiveExpose, mayHost, memoryRosterStore, readCert, signCert, signRoster, verifyCert,
  type ComputerCert, type Roster, type SignedRoster,
} from '../src/computers/computer-cert.ts'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'

/**
 * D-116: the certificate of a computer and the roster with a version (Lumen L1, L2, L4). What the owner signed is the truth; what arrives on the wire never is.
 */
const NOW = 1_800_000_000_000
const OWNER = generateIdentity()
const OTHER = generateIdentity() // somebody who is not the owner
const B = publicIdentity(generateIdentity())
const C = publicIdentity(generateIdentity())
const D = publicIdentity(generateIdentity())
const iso = (at: number): string => new Date(at).toISOString()
const certB = (over: Partial<ComputerCert> = {}): ComputerCert => ({ ...certFor({ identity: B, label: 'PC da padaria', registeredBy: 'ana', registeredAt: iso(NOW) }), ...over })
const rosterOf = (version: number, certs: ComputerCert[], revoked: string[] = [], at = NOW): Roster => ({ schema: 'roster/v1', workspaceId: 'ws1', version, issuedAt: iso(at), certs: certs.map(cert => signCert(cert, OWNER.signing.seed)), revoked })
const signed = (roster: Roster): SignedRoster => signRoster(roster, OWNER.signing.seed)
const guard = (now = NOW + 1_000, store = memoryRosterStore()): RosterGuard => new RosterGuard('ws1', OWNER.signing.publicKey, store, () => now)

describe('the id and the fingerprint of a computer', () => {
  it('the id is derived from the PUBLIC signing key: stable, 16 hex, and different for another key', () => {
    expect(computerIdOf(B)).toBe(computerIdOf(B))
    expect(computerIdOf(B)).toMatch(/^[0-9a-f]{16}$/u)
    expect(computerIdOf(B)).not.toBe(computerIdOf(C))
    expect(computerIdOf({ signing: B.signing, agreement: C.agreement })).toBe(computerIdOf(B)) // the id names the SIGNING key
  })

  it('fingerprint-bits >= 56: what the owner compares out loud is 20 hex digits (80 bits) of BOTH keys of the computer', () => {
    const text = computerFingerprint(B)
    expect(text.replace(/\s/gu, '')).toMatch(/^[0-9a-f]{20}$/u)
    expect(text).not.toBe(computerFingerprint({ signing: B.signing, agreement: C.agreement })) // changes with the agreement key too
    expect(text).not.toBe(computerFingerprint({ signing: C.signing, agreement: B.agreement }))
  })
})

describe('the certificate', () => {
  it('a new certificate exposes NOTHING and is for the owner only; the owner widens it on purpose', () => {
    const cert = certB()
    expect(cert.caps).toEqual({ expose: [], hostFor: ['ana'], perCreatorMax: 3, maxAutonomy: 'baixa' })
    expect(cert.computerId).toBe(computerIdOf(B))
  })

  it('the owner\'s signature makes it: it verifies against the owner, and against nobody else', () => {
    const cert = signCert(certB(), OWNER.signing.seed)
    expect(verifyCert(cert, OWNER.signing.publicKey)).toEqual(certB())
    expect(verifyCert(cert, OTHER.signing.publicKey)).toBeUndefined()
  })

  it('any change after signing breaks it (the label, the keys, what it exposes, who may host)', () => {
    const cert = signCert(certB(), OWNER.signing.seed)
    const tampered = (over: Partial<ComputerCert>): unknown => ({ ...cert, cert: { ...cert.cert, ...over } })
    expect(verifyCert(tampered({ label: 'outro nome' }), OWNER.signing.publicKey)).toBeUndefined()
    expect(verifyCert(tampered({ caps: { ...cert.cert.caps, expose: ['cofre'] } }), OWNER.signing.publicKey)).toBeUndefined()
    expect(verifyCert(tampered({ caps: { ...cert.cert.caps, hostFor: ['ana', 'mallory'] } }), OWNER.signing.publicKey)).toBeUndefined()
    expect(verifyCert(tampered({ agreement: C.agreement }), OWNER.signing.publicKey)).toBeUndefined() // the key a bundle is sealed for cannot be swapped
  })

  it('the id must be the id of ITS OWN key: a certificate that names one id and carries another computer\'s keys is not a certificate', () => {
    expect(readCert({ ...certB(), computerId: computerIdOf(C) })).toBeUndefined()
    expect(readCert(certB())).toBeDefined()
  })

  it('a closed schema: unknown fields (top level or in caps), wrong types and out-of-range values are refused; nothing else survives', () => {
    const bad: unknown[] = [
      null, 5, 'x', [], {}, { ...certB(), extra: 1 }, { ...certB(), caps: { ...certB().caps, extra: [] } }, { ...certB(), caps: { ...certB().caps, perCreatorMax: -1 } },
      { ...certB(), caps: { ...certB().caps, perCreatorMax: 1.5 } }, { ...certB(), caps: { ...certB().caps, maxAutonomy: 'total' } }, { ...certB(), caps: { ...certB().caps, expose: 'cofre' } },
      { ...certB(), label: '' }, { ...certB(), label: 'x'.repeat(81) }, { ...certB(), schema: 'computer-cert/v2' },
    ]
    for (const value of bad) expect(readCert(value), JSON.stringify(value)).toBeUndefined()
    const dirty = { ...certB(), caps: { ...certB().caps } }
    expect(Object.keys(readCert(dirty) ?? {}).sort()).toEqual(['agreement', 'caps', 'computerId', 'label', 'registeredAt', 'registeredBy', 'schema', 'signing'])
  })
})

describe('Lumen L2: who may put a persona on a computer (the computer decides, not the screen)', () => {
  const cert = certB({ caps: { expose: [], hostFor: ['ana', 'bia'], perCreatorMax: 2, maxAutonomy: 'media' } })

  it('home-needs-host-permission: only the owner and the people the owner listed', () => {
    expect(mayHost(cert, 'ana', 0, 'baixa')).toBe('ok')
    expect(mayHost(cert, 'bia', 0, 'baixa')).toBe('ok')
    expect(mayHost(cert, 'mallory', 0, 'baixa')).toBe('host-not-allowed')
    expect(mayHost(cert, '', 0, 'baixa')).toBe('host-not-allowed')
  })

  it('host-quota-per-creator: one creator cannot fill the computer', () => {
    expect(mayHost(cert, 'bia', 1, 'baixa')).toBe('ok')
    expect(mayHost(cert, 'bia', 2, 'baixa')).toBe('creator-quota')
    expect(mayHost(cert, 'ana', 0, 'baixa')).toBe('ok') // another creator is not affected
  })

  it('the autonomy a persona may have here is capped by the computer', () => {
    expect(mayHost(cert, 'ana', 0, 'media')).toBe('ok')
    expect(mayHost(cert, 'ana', 0, 'alta')).toBe('autonomy-too-high')
  })
})

describe('Lumen L1: the creator\'s grant is on TOP of what the operator exposes (two consents)', () => {
  it('grant-needs-operator-exposure: what the operator did not expose never reaches the persona, whatever the creator granted', () => {
    const closed = certB()
    expect(effectiveExpose(closed, ['comp-b:gmail', 'cofre', 'browser'])).toEqual([])
    const open = certB({ caps: { ...certB().caps, expose: ['comp-b:gmail'] } })
    expect(effectiveExpose(open, ['comp-b:gmail', 'cofre', 'browser'])).toEqual(['comp-b:gmail'])
  })

  it('connector-identity-includes-computer: the same name on two computers is two connectors', () => {
    const open = certB({ caps: { ...certB().caps, expose: ['comp-b:gmail'] } })
    expect(effectiveExpose(open, ['comp-c:gmail'])).toEqual([]) // the creator\'s Gmail on ANOTHER computer is not this one\'s
    expect(effectiveExpose(open, ['gmail'])).toEqual([]) // a bare name is nothing
  })

  it('cofre-of-b-not-reachable-by-creator-grant: only an explicit `cofre` exposure by the operator opens it', () => {
    expect(effectiveExpose(certB(), ['cofre'])).toEqual([])
    expect(effectiveExpose(certB({ caps: { ...certB().caps, expose: ['cofre'] } }), ['cofre'])).toEqual(['cofre'])
  })
})

describe('the roster with a version (Lumen L4)', () => {
  it('a roster signed by the owner is accepted, and the computer then knows the certificates in it', () => {
    const roster = guard()
    expect(roster.accept(signed(rosterOf(1, [certB(), certB({ ...certFor({ identity: C, label: 'PC do estoque', registeredBy: 'ana', registeredAt: iso(NOW) }) })])))).toBe('ok')
    expect(roster.version()).toBe(1)
    expect(roster.certOf(computerIdOf(B))?.label).toBe('PC da padaria')
    expect(roster.certOf(computerIdOf(D))).toBeUndefined() // not in the roster
  })

  it('roster-rollback-rejected: an OLDER roster is refused, and a same-version roster that says something else too', () => {
    const roster = guard()
    expect(roster.accept(signed(rosterOf(2, [certB()])))).toBe('ok')
    expect(roster.accept(signed(rosterOf(1, [certB()])))).toBe('rollback')
    expect(roster.accept(signed(rosterOf(2, [certB()], [computerIdOf(C)])))).toBe('rollback') // same version, different content
    expect(roster.accept(signed(rosterOf(2, [certB()])))).toBe('ok') // the very same roster again is fine
    expect(roster.accept(signed(rosterOf(3, [certB()])))).toBe('ok')
    expect(roster.version()).toBe(3)
  })

  it('revoked-computer-stays-revoked-after-replay: replaying the roster from BEFORE the revocation does not bring it back', () => {
    const roster = guard()
    roster.accept(signed(rosterOf(1, [certB()])))
    expect(roster.certOf(computerIdOf(B))).toBeDefined()
    expect(roster.accept(signed(rosterOf(2, [], [computerIdOf(B)])))).toBe('ok')
    expect(roster.isRevoked(computerIdOf(B))).toBe(true)
    expect(roster.certOf(computerIdOf(B))).toBeUndefined()
    expect(roster.accept(signed(rosterOf(1, [certB()])))).toBe('rollback') // the old roster, replayed by the bridge or a malicious computer
    expect(roster.certOf(computerIdOf(B))).toBeUndefined()
  })

  it('the highest version survives a restart (a computer that was off does not forget what it saw)', () => {
    const store = memoryRosterStore()
    guard(NOW + 1_000, store).accept(signed(rosterOf(5, [certB()])))
    const after = guard(NOW + 2_000, store) // "restart"
    expect(after.version()).toBe(5)
    expect(after.accept(signed(rosterOf(4, [certB()])))).toBe('rollback')
  })

  it('stale-roster-stops-accepting-bundles: with no roster from the last 24 hours the computer knows nobody (safe failure)', () => {
    const at = { now: NOW + 1_000 }
    const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => at.now)
    roster.accept(signed(rosterOf(1, [certB()], [], NOW)))
    expect(roster.fresh()).toBe(true)
    at.now = NOW + ROSTER_FRESH_MS - 1
    expect(roster.certOf(computerIdOf(B))).toBeDefined()
    at.now = NOW + ROSTER_FRESH_MS
    expect(roster.fresh()).toBe(false)
    expect(roster.certOf(computerIdOf(B))).toBeUndefined()
    expect(roster.accept(signed(rosterOf(2, [certB()], [], at.now)))).toBe('ok') // a new roster from the owner brings it back
    expect(roster.certOf(computerIdOf(B))).toBeDefined()
  })

  it('a roster dated in the FUTURE is not fresh (a bridge cannot keep an old roster alive by lying about its date)', () => {
    const roster = guard(NOW)
    roster.accept(signed(rosterOf(1, [certB()], [], NOW + 3_600_000)))
    expect(roster.fresh()).toBe(false)
  })

  it('refuses what is not the owner\'s roster: a bad signature, another workspace, a certificate the owner did not sign, an unknown field', () => {
    const roster = guard()
    const good = signed(rosterOf(1, [certB()]))
    expect(roster.accept({ ...good, signature: `${good.signature.slice(0, 10)}${good.signature[10] === 'A' ? 'B' : 'A'}${good.signature.slice(11)}` })).toBe('bad-signature')
    expect(roster.accept(signRoster(rosterOf(1, [certB()]), OTHER.signing.seed))).toBe('bad-signature') // signed by somebody who is not the owner
    expect(roster.accept(signRoster({ ...rosterOf(1, [certB()]), workspaceId: 'ws-outro' }, OWNER.signing.seed))).toBe('wrong-workspace')
    const forged = { ...rosterOf(1, [certB()]), certs: [signCert(certB(), OTHER.signing.seed)] }
    expect(roster.accept(signRoster(forged, OWNER.signing.seed))).toBe('bad-cert') // the owner signed the roster, but the certificate inside is not the owner's
    expect(roster.accept({ roster: { ...good.roster, extra: 1 }, signature: good.signature })).toBe('schema')
    for (const bad of [null, 5, 'x', {}, { roster: null, signature: 'x' }, { roster: good.roster }]) expect(roster.accept(bad), JSON.stringify(bad)).toBe('schema')
    expect(roster.version()).toBe(0) // nothing of the above was kept
  })
})
