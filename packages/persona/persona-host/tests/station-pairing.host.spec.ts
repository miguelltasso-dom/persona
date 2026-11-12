import { describe, expect, it } from 'vitest'
import { PAIRING_ALPHABET, PAIRING_TTL_MS, PairingBook } from '../src/station/pairing.ts'

/** A book whose characters are deterministic, so a test can know the code. */
function book(seed = 0): { book: PairingBook; clock: { now: number } } {
  let at = seed
  const clock = { now: 1_000 }
  const instance = new PairingBook({
    now: () => clock.now,
    pick: () => { at = (at + 7) % PAIRING_ALPHABET.length; return PAIRING_ALPHABET[at] ?? 'A' },
  })
  return { book: instance, clock }
}

describe('COLHEITA 24: the pairing code of the dedicated station', () => {
  it('shows XXXX-XXXX, keeps only the hash and pairs once', () => {
    const { book: pairing } = book()
    const issued = pairing.issue()
    expect(issued.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/u)
    expect(issued.code).not.toMatch(/[01OI]/u)
    expect(pairing.pending()).toBe(1)
    expect(pairing.redeem(issued.code)).toBe('ok')
    expect(pairing.redeem(issued.code)).toBe('usado')
    expect(pairing.pending()).toBe(0)
  })

  it('forgives case and dashes, and refuses a code nobody issued', () => {
    const { book: pairing } = book()
    const issued = pairing.issue()
    expect(pairing.redeem(issued.code.toLowerCase().replace('-', ' '))).toBe('ok')
    expect(pairing.redeem('ZZZZ-ZZZZ')).toBe('invalido')
  })

  it('stops working after ten minutes', () => {
    const { book: pairing, clock } = book()
    const issued = pairing.issue()
    clock.now += PAIRING_TTL_MS - 1
    expect(pairing.redeem(issued.code)).toBe('ok')
    const second = pairing.issue()
    clock.now += PAIRING_TTL_MS
    expect(pairing.redeem(second.code)).toBe('expirado')
    expect(pairing.pending()).toBe(0)
  })
})
