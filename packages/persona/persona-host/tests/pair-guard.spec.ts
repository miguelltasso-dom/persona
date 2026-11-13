import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DevicePairing, MAX_ADDRESSES, MAX_OPEN_CODES, PAIR_ADDRESS_MAX, PAIR_BACKOFF_MS, PAIR_GLOBAL_MAX, filePairStore, memoryPairStore, type DeviceRedeem,
} from '../src/remote-web/pair-guard.ts'
import { PAIRING_LOCK_MS, PAIRING_TTL_MS } from '../src/station/pairing.ts'

/**
 * M5 (Lumen B): the codes that open a pairing and their lock. Five wrong tries from ONE address lock that address (and nobody else); only the GLOBAL ceiling burns the open codes; nothing is lost by
 * restarting; the code itself is never kept.
 */
const clock = (start = 1_800_000_000_000): { now: () => number; advance: (ms: number) => void } => {
  let at = start
  return { now: () => at, advance: (ms) => { at += ms } }
}
const ok = (answer: DeviceRedeem): string => { if (!answer.ok) throw new Error(`refused: ${answer.reason}`); return answer.memberId }
const wrong = (pairing: DevicePairing, address: string, times: number): DeviceRedeem[] => Array.from({ length: times }, (_, index) => pairing.redeem(`ZZZZ-${String(2000 + index)}`, address))

describe('the code', () => {
  it('pairs ONCE, for the member it was opened for; case and dash are forgiven; the format is the Estação\'s', () => {
    const pairing = new DevicePairing()
    const issued = pairing.issue('m-ana')
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u)
    expect(ok(pairing.redeem(issued.code.toLowerCase().replace('-', ''), '100.64.0.2'))).toBe('m-ana')
    expect(pairing.redeem(issued.code, '100.64.0.2')).toEqual({ ok: false, reason: 'recusado' }) // a photo of the code is worth nothing after the first use
  })

  it('two open codes are two members; more than the cap drops the oldest', () => {
    const pairing = new DevicePairing()
    const ana = pairing.issue('m-ana')
    const beto = pairing.issue('m-beto')
    expect(ok(pairing.redeem(beto.code, 'a'))).toBe('m-beto')
    expect(ok(pairing.redeem(ana.code, 'a'))).toBe('m-ana')
    const first = pairing.issue('m-0')
    for (let index = 1; index <= MAX_OPEN_CODES; index += 1) pairing.issue(`m-${String(index)}`)
    expect(pairing.pending()).toBe(MAX_OPEN_CODES)
    expect(pairing.redeem(first.code, 'a')).toEqual({ ok: false, reason: 'recusado' })
  })

  it('a code is worth ten minutes (and expired looks like wrong: the route is no oracle)', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    const issued = pairing.issue('m-ana')
    time.advance(PAIRING_TTL_MS - 1)
    expect(pairing.pending()).toBe(1)
    time.advance(2)
    expect(pairing.pending()).toBe(0)
    expect(pairing.redeem(issued.code, 'a')).toEqual({ ok: false, reason: 'recusado' })
  })

  it('every open code is compared (the right one among several is found wherever it sits)', () => {
    const pairing = new DevicePairing()
    const codes = ['m-0', 'm-1', 'm-2', 'm-3', 'm-4'].map(member => ({ member, code: pairing.issue(member).code }))
    for (const entry of [...codes].reverse()) expect(ok(pairing.redeem(entry.code, 'a'))).toBe(entry.member)
  })
})

describe('the lock is per ADDRESS (Lumen 14:55: a malicious node must not close the owner\'s pairing)', () => {
  it('five wrong tries lock THAT address ("bloqueado" + how long), the right code from it too, but the owner\'s open code still works from another address', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    const issued = pairing.issue('m-ana')
    const answers = wrong(pairing, '100.64.0.66', PAIR_ADDRESS_MAX)
    expect(answers.every(item => !item.ok && item.reason === 'recusado')).toBe(true)
    const locked = pairing.redeem(issued.code, '100.64.0.66') // the RIGHT code, from the locked address
    expect(locked).toMatchObject({ ok: false, reason: 'bloqueado' })
    expect(locked.ok ? 0 : (locked as { retryAfterS: number }).retryAfterS).toBeGreaterThan(0)
    expect(pairing.pending()).toBe(1) // the code is NOT burned by one address erring
    expect(ok(pairing.redeem(issued.code, '100.64.0.7'))).toBe('m-ana') // the owner's phone gets in
  })

  it('the penalty doubles at each strike (1 min, 2 min…) and the address is free again after it', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    pairing.issue('m-ana')
    wrong(pairing, 'x', PAIR_ADDRESS_MAX)
    const first = pairing.redeem('AAAA-BBBB', 'x')
    expect(first).toMatchObject({ ok: false, reason: 'bloqueado', retryAfterS: PAIR_BACKOFF_MS / 1000 })
    time.advance(PAIR_BACKOFF_MS + 1)
    wrong(pairing, 'x', PAIR_ADDRESS_MAX)
    const second = pairing.redeem('AAAA-BBBB', 'x')
    expect(second).toMatchObject({ ok: false, reason: 'bloqueado', retryAfterS: (PAIR_BACKOFF_MS * 2) / 1000 })
    time.advance(PAIR_BACKOFF_MS * 2 + 1)
    expect(pairing.redeem('AAAA-BBBB', 'x')).toEqual({ ok: false, reason: 'recusado' }) // free to answer again
  })

  it('wrong tries older than the window do not add up', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    pairing.issue('m-ana')
    for (let round = 0; round < 6; round += 1) { wrong(pairing, 'slow', PAIR_ADDRESS_MAX - 1); time.advance(11 * 60_000) }
    expect(pairing.redeem('AAAA-BBBB', 'slow')).toEqual({ ok: false, reason: 'recusado' }) // never "bloqueado": it never made 5 inside 10 min
  })
})

describe('Lumen P2-4: the per-address memory is bounded, and a blocked attacker is never forgotten to make room', () => {
  it('with every slot taken by blocked or recently active addresses, a NEW address is not tracked — and the blocked attacker stays blocked', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now) // no code open: these wrong tries count for their address only (not for the global ceiling)
    wrong(pairing, 'attacker', PAIR_ADDRESS_MAX)
    expect(pairing.redeem('AAAA-BBBB', 'attacker')).toMatchObject({ ok: false, reason: 'bloqueado' }) // the oldest entry, and blocked
    for (let node = 0; node < MAX_ADDRESSES - 1; node += 1) wrong(pairing, `a${String(node)}`, 1) // 255 more: the table is full of recent activity
    wrong(pairing, 'newcomer', 1) // full, nothing evictable: it is not tracked per address
    expect(pairing.redeem('AAAA-BBBB', 'attacker')).toMatchObject({ ok: false, reason: 'bloqueado' }) // NOT forgotten (the old code evicted the oldest key: the attacker)
  })

  it('when entries go idle (a blocked address after its penalty, the rest after the window), room is made again', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    wrong(pairing, 'attacker', PAIR_ADDRESS_MAX)
    for (let node = 0; node < MAX_ADDRESSES - 1; node += 1) wrong(pairing, `a${String(node)}`, 1)
    time.advance(11 * 60_000) // every window is over and the first penalty (1 min) is served
    wrong(pairing, 'newcomer', PAIR_ADDRESS_MAX) // now it is tracked, and gets locked like anybody
    expect(pairing.redeem('AAAA-BBBB', 'newcomer')).toMatchObject({ ok: false, reason: 'bloqueado' })
  })
})

describe('the GLOBAL ceiling burns the codes; with no code open nothing locks the owner', () => {
  it('thirty wrong guesses an hour while a code is open (from many addresses) BURN every open code and lock the book; the owner\'s NEW code opens it again', () => {
    const time = clock()
    const pairing = new DevicePairing(memoryPairStore(), time.now)
    const issued = pairing.issue('m-ana')
    for (let node = 0; node < PAIR_GLOBAL_MAX / PAIR_ADDRESS_MAX; node += 1) wrong(pairing, `100.64.1.${String(node)}`, PAIR_ADDRESS_MAX)
    expect(pairing.pending()).toBe(0)
    expect(pairing.redeem(issued.code, '100.64.9.9')).toMatchObject({ ok: false, reason: 'bloqueado' }) // the right code, burned
    time.advance(PAIRING_LOCK_MS / 2)
    expect(pairing.redeem(issued.code, '100.64.9.9')).toMatchObject({ ok: false, reason: 'bloqueado' })
    const fresh = pairing.issue('m-ana')
    expect(ok(pairing.redeem(fresh.code, '100.64.9.9'))).toBe('m-ana')
  })

  it('wrong guesses made while NO code is open never count for the global ceiling later (29 stale ones + 1 with a code open must not burn the owner\'s code)', () => {
    const pairing = new DevicePairing()
    for (let node = 0; node < 5; node += 1) wrong(pairing, `100.64.3.${String(node)}`, PAIR_ADDRESS_MAX) // 25 wrong guesses, nothing open
    wrong(pairing, '100.64.3.5', 4) // 29 in all
    const issued = pairing.issue('m-ana')
    wrong(pairing, '100.64.3.99', 1) // the 30th by count — but only ONE was made while a code was open
    expect(pairing.pending()).toBe(1) // the code is not burned
    expect(ok(pairing.redeem(issued.code, '100.64.9.9'))).toBe('m-ana')
  })

  it('with NO code open, wrong guesses lock their ADDRESS only: the owner\'s next code works at once', () => {
    const pairing = new DevicePairing()
    for (let node = 0; node < 40; node += 1) wrong(pairing, `100.64.2.${String(node)}`, PAIR_ADDRESS_MAX) // 200 wrong guesses, nothing open
    const issued = pairing.issue('m-ana')
    expect(ok(pairing.redeem(issued.code, '100.64.9.9'))).toBe('m-ana')
  })
})

describe('on disk: nothing is lost by restarting (Lumen B2) and the code is never kept', () => {
  const withFile = <T>(run: (path: string) => T): T => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-pair-'))
    try { return run(join(dir, 'pair-state.json')) } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('restarting the host in the middle does not reset the count: four wrong, restart, the fifth still locks the address', () => {
    withFile((path) => {
      const time = clock()
      const before = new DevicePairing(filePairStore(path), time.now)
      before.issue('m-ana')
      wrong(before, 'x', PAIR_ADDRESS_MAX - 1)
      const after = new DevicePairing(filePairStore(path), time.now) // "restart"
      expect(wrong(after, 'x', 1)[0]).toEqual({ ok: false, reason: 'recusado' })
      expect(after.redeem('AAAA-BBBB', 'x')).toMatchObject({ ok: false, reason: 'bloqueado' })
      const again = new DevicePairing(filePairStore(path), time.now) // and the lock survives another restart
      expect(again.redeem('AAAA-BBBB', 'x')).toMatchObject({ ok: false, reason: 'bloqueado' })
    })
  })

  it('an open code survives a restart (the update restarted the app; the code still has its ten minutes); a burned one stays burned', () => {
    withFile((path) => {
      const time = clock()
      const before = new DevicePairing(filePairStore(path), time.now)
      const issued = before.issue('m-ana')
      expect(ok(new DevicePairing(filePairStore(path), time.now).redeem(issued.code, 'a'))).toBe('m-ana')
      const burn = new DevicePairing(filePairStore(path), time.now)
      const second = burn.issue('m-ana')
      for (let node = 0; node < PAIR_GLOBAL_MAX / PAIR_ADDRESS_MAX; node += 1) wrong(burn, `n${String(node)}`, PAIR_ADDRESS_MAX)
      expect(new DevicePairing(filePairStore(path), time.now).redeem(second.code, 'fresh')).toMatchObject({ ok: false, reason: 'bloqueado' })
    })
  })

  it('the file holds only hashes: neither the code (with or without its dash) nor its letters in a row', () => {
    withFile((path) => {
      const pairing = new DevicePairing(filePairStore(path))
      const issued = pairing.issue('m-ana')
      const text = readFileSync(path, 'utf8')
      expect(text).not.toContain(issued.code)
      expect(text).not.toContain(issued.code.replace('-', ''))
      expect(text).toContain('m-ana')
    })
  })

  it('a damaged or missing file is a fresh state with NO open code (nobody is paired by accident)', () => {
    withFile((path) => {
      expect(new DevicePairing(filePairStore(path)).pending()).toBe(0)
    })
  })
})
