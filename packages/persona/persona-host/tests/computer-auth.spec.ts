import { describe, expect, it } from 'vitest'
import { generateIdentity, publicIdentity } from '@deepseek-ai/dsh-persona-sync'
import { ROSTER_FRESH_MS, RosterGuard, certFor, computerIdOf, memoryRosterStore, signCert, signRoster } from '../src/computers/computer-cert.ts'
import { COMPUTER_REPLAY_KEPT, COMPUTER_SKEW_MS, ComputerAuth, signComputerRequest, type Precheck, type SignedRequestFacts } from '../src/computers/computer-auth.ts'

/**
 * D-116: one computer proves to another who is calling by signing the request itself; the receiver believes only the key the OWNER put in the certificate.
 */
const NOW = 1_800_000_000_000
const OWNER = generateIdentity()
const A = generateIdentity()
const B = generateIdentity()
const STRANGER = generateIdentity()
const idOf = (who: ReturnType<typeof generateIdentity>): string => computerIdOf(publicIdentity(who))
const iso = (at: number): string => new Date(at).toISOString()

function guard(clock: { now: number }, revoked: string[] = [], who: readonly ReturnType<typeof generateIdentity>[] = [A, B]): RosterGuard {
  const certs = who.map(item => signCert(certFor({ identity: publicIdentity(item), label: 'PC', registeredBy: 'ana', registeredAt: iso(NOW) }), OWNER.signing.seed))
  const roster = new RosterGuard('ws1', OWNER.signing.publicKey, memoryRosterStore(), () => clock.now)
  expect(roster.accept(signRoster({ schema: 'roster/v1', workspaceId: 'ws1', version: 1, issuedAt: iso(NOW), certs, revoked }, OWNER.signing.seed))).toBe('ok')
  return roster
}

const facts = (over: Partial<SignedRequestFacts> = {}): SignedRequestFacts => ({ method: 'POST', path: '/remote/computer/message', host: '100.64.0.2:47310', body: '{"type":"received"}', ...over })
const header = (clock: { now: number }, over: Partial<SignedRequestFacts> = {}, who = A): string => signComputerRequest({ ...facts(over), computerId: idOf(who), signingSeed: who.signing.seed, now: clock.now })
const check = (auth: ComputerAuth, value: string | undefined, over: Partial<SignedRequestFacts> = {}): ReturnType<ComputerAuth['verify']> | { ok: false; reason: string } => {
  const pre = auth.precheck(value)
  return 'refused' in pre ? { ok: false, reason: pre.refused } : auth.verify(pre, facts(over))
}

describe('a signed request between computers', () => {
  it('is accepted when the caller is in the roster the owner signed and the signature covers THIS request', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    expect(check(auth, header(clock))).toEqual({ ok: true, computerId: idOf(A) })
  })

  it('is refused when anything it signed changed: the method, the path, the host it was addressed to, the body', () => {
    const clock = { now: NOW }
    for (const change of [{ method: 'GET' }, { path: '/remote/computer/beat' }, { host: '100.64.0.9:47310' }, { body: '{"type":"released"}' }] as Partial<SignedRequestFacts>[]) {
      const auth = new ComputerAuth(guard(clock), () => clock.now)
      expect(check(auth, header(clock), change), JSON.stringify(change)).toEqual({ ok: false, reason: 'bad-signature' })
    }
  })

  it('the host is part of the proof: a request meant for B is not good at C', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const forB = header(clock, { host: '100.64.0.2:47310' })
    expect(check(auth, forB, { host: '100.64.0.3:47310' })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('a request signed with a key that is not the one in the caller\'s certificate is refused, even when it names a real computer', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const forged = signComputerRequest({ ...facts(), computerId: idOf(A), signingSeed: STRANGER.signing.seed, now: clock.now })
    expect(check(auth, forged)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('a computer that is not in the roster, or was revoked, is nobody', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock, [idOf(B)]), () => clock.now)
    expect(check(auth, header(clock, {}, STRANGER))).toEqual({ ok: false, reason: 'unknown-computer' })
    expect(check(auth, header(clock, {}, B))).toEqual({ ok: false, reason: 'unknown-computer' })
    expect(check(auth, header(clock))).toMatchObject({ ok: true }) // the others still are
  })

  it('with no fresh roster nobody is accepted (safe failure: no roster, no calls)', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const value = header(clock)
    clock.now += ROSTER_FRESH_MS + 1_000
    const late = signComputerRequest({ ...facts(), computerId: idOf(A), signingSeed: A.signing.seed, now: clock.now })
    expect(check(auth, late)).toEqual({ ok: false, reason: 'unknown-computer' })
    expect(value).toBeTruthy()
  })
})

describe('time and replay', () => {
  it('a request more than a minute old, or from more than a minute ahead, is `skew`; a minute either side is fine', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const stamped = (at: number): string => signComputerRequest({ ...facts(), computerId: idOf(A), signingSeed: A.signing.seed, now: at })
    expect(check(auth, stamped(NOW - COMPUTER_SKEW_MS - 1))).toEqual({ ok: false, reason: 'skew' })
    expect(check(auth, stamped(NOW + COMPUTER_SKEW_MS + 1))).toEqual({ ok: false, reason: 'skew' })
    expect(check(auth, stamped(NOW - COMPUTER_SKEW_MS))).toMatchObject({ ok: true })
    expect(check(auth, stamped(NOW + COMPUTER_SKEW_MS))).toMatchObject({ ok: true })
  })

  it('the same request twice is a `replay`; a new one (new time) is fine', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const value = header(clock)
    expect(check(auth, value)).toMatchObject({ ok: true })
    expect(check(auth, value)).toEqual({ ok: false, reason: 'replay' })
    clock.now += 5
    expect(check(auth, header(clock))).toMatchObject({ ok: true })
  })

  it('a request that fails its signature is NOT remembered (garbage cannot fill the memory of replays)', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const value = header(clock)
    expect(check(auth, value, { body: 'x' })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(check(auth, value)).toMatchObject({ ok: true }) // the real one still works: the bad try did not burn it
  })

  it('the memory of replays is bounded, and the most recent signatures are always in it', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now, 8) // a small memory, so the test needs a few signatures and not four thousand
    let last = ''
    let first = ''
    for (let index = 0; index < 18; index += 1) {
      clock.now += 1
      last = header(clock, { body: `n${String(index)}` })
      if (index === 0) first = last
      expect(check(auth, last, { body: `n${String(index)}` })).toMatchObject({ ok: true })
    }
    expect(check(auth, last, { body: 'n17' })).toEqual({ ok: false, reason: 'replay' }) // the most recent is remembered
    expect(check(auth, first, { body: 'n0' })).toMatchObject({ ok: true }) // the oldest fell out: the price of a finite memory, bounded by the minute the clock allows
    expect(COMPUTER_REPLAY_KEPT).toBeGreaterThanOrEqual(1_000) // and the real memory is large
  })

  it('a request is worth a minute either side: after that the clock refuses it even if the memory forgot it', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    const value = header(clock)
    expect(check(auth, value)).toMatchObject({ ok: true })
    clock.now += COMPUTER_SKEW_MS * 2 + 5_000
    expect(check(auth, value)).toEqual({ ok: false, reason: 'skew' }) // too old to be replayed anyway
  })
})

describe('the cheap checks run before the body is read', () => {
  it('malformed headers are `malformed` without touching a key', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    for (const value of [undefined, '', 'v1', 'v2.a.1.b', 'v1.a.b.c', 'v1.a.1', 'v1.a.1.b.c', `v1.a.${'9'.repeat(40)}.b`, 'x'.repeat(400), 'v1..1.', '1.2.3.4']) {
      const pre = auth.precheck(value)
      expect('refused' in pre ? pre.refused : 'ok', String(value)).toBe('malformed')
    }
  })

  it('an unknown caller or a stale time is refused by `precheck`, with no body needed', () => {
    const clock = { now: NOW }
    const auth = new ComputerAuth(guard(clock), () => clock.now)
    expect(auth.precheck(header(clock, {}, STRANGER))).toEqual({ refused: 'unknown-computer' })
    expect(auth.precheck(signComputerRequest({ ...facts(), computerId: idOf(A), signingSeed: A.signing.seed, now: NOW - 3_600_000 }))).toEqual({ refused: 'skew' })
    const ok = auth.precheck(header(clock)) as Precheck
    expect(ok).toMatchObject({ computerId: idOf(A), signingPublic: A.signing.publicKey })
  })
})
