/**
 * H23 / F2: the hub knows WHO calls, by a signature (Ed25519 over METHOD, target, timestamp and the SHA-256 of the body), not by a header it trusts.
 * Pure: the same verifier the Worker runs, against the signer the host runs.
 */
import { describe, expect, it } from 'vitest'
import { generateIdentity } from '../src/keys.ts'
import { MemoryReplayStore, REQUEST_SKEW_MS, parsePersonaSig, verifyRequest, type RequestAuthResult } from '../src/request-auth.ts'
import { createRequestSigner, signRequest } from '../src/request-sign.ts'

const ana = generateIdentity()
const bia = generateIdentity()
const roster = (actor: string): string | undefined => (actor === 'ana' ? ana.signing.publicKey : actor === 'bia' ? bia.signing.publicKey : undefined)
const NOW = 1_800_000_000_000
const TARGET = '/w/ws/sync/after?streamId=channel%3Ageral&afterSeq=0'
const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

const sign = (patch: Partial<Parameters<typeof signRequest>[0]> = {}): string =>
  signRequest({ actor: 'ana', signingSeed: ana.signing.seed, method: 'GET', target: TARGET, ts: NOW, ...patch })
const check = (authorization: string | null, patch: { method?: string; target?: string; body?: string; now?: number; replay?: MemoryReplayStore } = {}): Promise<RequestAuthResult> =>
  verifyRequest({ method: patch.method ?? 'GET', target: patch.target ?? TARGET, authorization, body: enc(patch.body ?? '') }, roster, patch.replay ?? new MemoryReplayStore(), patch.now ?? NOW)
const failure = async (authorization: string | null, patch: Parameters<typeof check>[1] = {}): Promise<string> => {
  const result = await check(authorization, patch)
  return result.ok ? 'OK' : result.code
}

describe('a signed request', () => {
  it('is accepted and says WHO signed it', async () => {
    expect(await check(sign())).toEqual({ ok: true, actor: 'ana' })
  })

  it('covers the body: the same call with another body is refused, with the right body it passes', async () => {
    const header = sign({ method: 'POST', target: '/w/ws/sync/append', body: '{"seq":1}' })
    expect(await failure(header, { method: 'POST', target: '/w/ws/sync/append', body: '{"seq":2}' })).toBe('BAD_SIGNATURE')
    expect((await check(header, { method: 'POST', target: '/w/ws/sync/append', body: '{"seq":1}' })).ok).toBe(true)
  })
})

describe('everything that is NOT a valid signature answers no (the edge has no way to skip this)', () => {
  it('no header, a malformed header, another scheme', async () => {
    expect(await failure(null)).toBe('MISSING')
    expect(await failure('')).toBe('MISSING')
    expect(await failure('Bearer abc')).toBe('MALFORMED')
    expect(await failure('Persona-Sig actor=ana,ts=abc,sig=xx')).toBe('MALFORMED')
    expect(parsePersonaSig('x-persona-actor: ana')).toBeUndefined()
  })

  it('the actor swapped (the old attack: "I am Bia"): the signature is Ana\'s, so it fails for Bia', async () => {
    const header = sign().replace('actor=ana', 'actor=bia')
    expect(await failure(header)).toBe('BAD_SIGNATURE')
  })

  it('an actor the roster does not know (or no longer knows: revoked)', async () => {
    expect(await failure(sign({ actor: 'caio' }))).toBe('UNKNOWN_ACTOR')
  })

  it('another method or target than the one signed', async () => {
    expect(await failure(sign(), { method: 'POST' })).toBe('BAD_SIGNATURE')
    expect(await failure(sign(), { target: '/w/ws/sync/after?streamId=channel%3Aoutro&afterSeq=0' })).toBe('BAD_SIGNATURE')
  })

  it('a timestamp too old or too far in the future', async () => {
    expect(await failure(sign({ ts: NOW - REQUEST_SKEW_MS - 1 }))).toBe('STALE')
    expect(await failure(sign({ ts: NOW + REQUEST_SKEW_MS + 1 }))).toBe('STALE')
    expect((await check(sign({ ts: NOW - REQUEST_SKEW_MS + 1 }))).ok).toBe(true)
  })

  it('the same signature twice (a replay), but only a VALID signature is remembered', async () => {
    const replay = new MemoryReplayStore()
    const header = sign()
    expect((await check(header, { replay })).ok).toBe(true)
    expect(await failure(header, { replay })).toBe('REPLAYED')
    // a forged one never enters the store, so it cannot be used to lock the real one out
    const forged = sign().replace('actor=ana', 'actor=bia')
    expect(await failure(forged, { replay })).toBe('BAD_SIGNATURE')
    expect(await failure(forged, { replay })).toBe('BAD_SIGNATURE')
  })

  it('a signature made with another person\'s key', async () => {
    expect(await failure(signRequest({ actor: 'ana', signingSeed: bia.signing.seed, method: 'GET', target: TARGET, ts: NOW }))).toBe('BAD_SIGNATURE')
  })
})

describe('one signer, many requests', () => {
  it('two identical requests in the same millisecond sign differently, so a poller and a push never look like a replay of each other', async () => {
    const signer = createRequestSigner('ana', ana.signing.seed, () => NOW)
    const first = signer.authorize({ method: 'GET', target: TARGET })
    const second = signer.authorize({ method: 'GET', target: TARGET })
    expect(first).not.toBe(second)
    const replay = new MemoryReplayStore()
    expect((await check(first, { replay })).ok).toBe(true)
    expect((await check(second, { replay, now: NOW + 10 })).ok).toBe(true)
    expect(await failure(first, { replay })).toBe('REPLAYED') // the very same header is still a replay
  })
})
