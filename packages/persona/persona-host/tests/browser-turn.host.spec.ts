import { describe, expect, it } from 'vitest'
import { holdsTurn, releaseTurn, takeTurn, turnHolder, TURN_IDLE_MS } from '../src/browser/turn.ts'

const PERSONA_A = { kind: 'persona', id: 'bia' } as const
const PERSONA_B = { kind: 'persona', id: 'teo' } as const
const PERSON = { kind: 'person', id: 'owner' } as const

describe('the turn of a shared profile', () => {
  it('a free turn is taken and lapses after the idle time', () => {
    const taken = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    expect(taken.ok).toBe(true)
    if (!taken.ok) return
    expect(taken.turn.until).toBe(1_000 + TURN_IDLE_MS)
    expect(turnHolder(taken.turn, 1_000 + TURN_IDLE_MS - 1)).toEqual(PERSONA_A)
    expect(turnHolder(taken.turn, 1_000 + TURN_IDLE_MS)).toBeUndefined()
  })

  it('the same holder renews without losing the start', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    const renewed = takeTurn(first.turn, { holder: PERSONA_A, granted: true }, 30_000)
    expect(renewed.ok).toBe(true)
    if (!renewed.ok) return
    expect(renewed.turn.since).toBe(1_000)
    expect(renewed.turn.until).toBe(30_000 + TURN_IDLE_MS)
  })

  it('another persona is told who holds it and since when', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    expect(takeTurn(first.turn, { holder: PERSONA_B, granted: true }, 5_000)).toEqual({
      ok: false, reason: 'busy', holder: PERSONA_A, since: 1_000,
    })
  })

  it('a persona without a grant is refused even on a free turn', () => {
    expect(takeTurn(undefined, { holder: PERSONA_A }, 1_000)).toEqual({ ok: false, reason: 'no-grant' })
  })

  it('the person takes the turn from a persona, never from another person', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    const person = takeTurn(first.turn, { holder: PERSON }, 2_000)
    expect(person.ok).toBe(true)
    if (!person.ok) return
    expect(takeTurn(person.turn, { holder: { kind: 'person', id: 'outra' } }, 3_000)).toMatchObject({ ok: false, reason: 'busy' })
  })

  it('a lapsed turn can be taken by someone else', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    const later = takeTurn(first.turn, { holder: PERSONA_B, granted: true }, 1_000 + TURN_IDLE_MS)
    expect(later.ok).toBe(true)
  })

  it('a run that lost the turn may not send a command', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    const person = takeTurn(first.turn, { holder: PERSON }, 2_000)
    if (!person.ok) throw new Error('expected the person to take it')
    expect(holdsTurn(person.turn, PERSONA_A, 2_100)).toBe(false)
    expect(holdsTurn(person.turn, PERSON, 2_100)).toBe(true)
  })

  it('only the holder releases', () => {
    const first = takeTurn(undefined, { holder: PERSONA_A, granted: true }, 1_000)
    if (!first.ok) throw new Error('expected a turn')
    expect(releaseTurn(first.turn, PERSONA_B, 2_000)).toBe(first.turn)
    expect(releaseTurn(first.turn, PERSONA_A, 2_000)).toBeUndefined()
  })
})
