/**
 * The shared paid-turn budget of the real run, as pure functions (fail closed; guard and verifier can never disagree).
 */
import { describe, expect, it } from 'vitest'
import { REAL_RUN_MAX_ATTEMPTS, REAL_RUN_MAX_PAID_TURNS, REAL_RUN_MAX_TURNS_PER_ATTEMPT, assessAttempts, attemptsForVerifier, chargedTurns, refusalsForNextAttempt, spentTurns, type BudgetAttempt } from '../src/real-run-budget.ts'

const attempt = (overrides: Partial<BudgetAttempt> = {}): BudgetAttempt => ({
  at: '2026-11-04T12:00:00.000Z', nsisCommit: 'abc', sha256: 'f'.repeat(64), outcome: 'FAILED', paidTurns: 1, capTurns: 1, ...overrides,
})

describe('assessAttempts (fail closed)', () => {
  it('accepts a well-formed history, including unknown (null) counts and a missing capTurns', () => {
    const assessed = assessAttempts([attempt(), attempt({ paidTurns: null, capTurns: null }), { ...attempt(), capTurns: undefined }])
    expect(assessed.problems).toEqual([])
    expect(assessed.attempts).toHaveLength(3)
  })

  it('refuses anything that could reopen balance: negative, fractional, text, unsafe, absent counters, wrong shapes', () => {
    for (const bad of [
      { ...attempt(), paidTurns: -5 },
      { ...attempt(), paidTurns: 0.5 },
      { ...attempt(), paidTurns: '1' },
      { ...attempt(), paidTurns: Number.MAX_SAFE_INTEGER + 2 },
      { ...attempt(), capTurns: -1 },
      { ...attempt(), capTurns: Number.NaN },
      { ...attempt(), outcome: '' },
      { ...attempt(), sha256: undefined },
      { at: 'x', sha256: 'y', outcome: 'z' }, // paidTurns absent
      null,
      [],
      'attempt',
    ]) {
      const assessed = assessAttempts([bad])
      expect(assessed.problems.length, JSON.stringify(bad)).toBeGreaterThan(0)
      expect(assessed.attempts, 'no attempts are returned from an untrusted history').toEqual([])
    }
    expect(assessAttempts({ not: 'a list' }).problems).toEqual(['the attempt history is not a list'])
    expect(assessAttempts(null).problems.length).toBeGreaterThan(0)
  })
})

describe('charged turns and the next-attempt guard', () => {
  it('charges max(ledger turns, limiter turns) and ONE when nothing could be read', () => {
    expect(chargedTurns({ paidTurns: 1, capTurns: 0 })).toBe(1)
    expect(chargedTurns({ paidTurns: 0, capTurns: 1 })).toBe(1) // the limiter booked a turn the ledger never recorded
    expect(chargedTurns({ paidTurns: null, capTurns: null })).toBe(1)
    expect(chargedTurns({ paidTurns: null })).toBe(1)
    expect(chargedTurns({ paidTurns: 2, capTurns: 1 })).toBe(2)
    expect(spentTurns([attempt(), attempt({ paidTurns: null, capTurns: null })])).toBe(2)
  })

  it('allows the first attempt and refuses at 3 attempts, 3 turns, or after a green', () => {
    expect(refusalsForNextAttempt([], 1)).toEqual([])
    expect(refusalsForNextAttempt([attempt()], 1)).toEqual([])
    expect(refusalsForNextAttempt([attempt(), attempt()], 1)).toEqual([])
    expect(refusalsForNextAttempt([attempt(), attempt(), attempt()], 1).join(' ')).toContain(`max ${String(REAL_RUN_MAX_ATTEMPTS)}`)
    expect(refusalsForNextAttempt([attempt({ paidTurns: 3, capTurns: 3 })], 1).join(' ')).toContain(`${String(REAL_RUN_MAX_PAID_TURNS)}-turn total`)
    expect(refusalsForNextAttempt([attempt({ outcome: 'delivered' })], 1).join(' ')).toContain('first green')
  })

  it('an earlier attempt that cost MORE than one turn blocks every later attempt: the verifier would reject that history for ever', () => {
    for (const spentOnIt of [{ paidTurns: 2, capTurns: 2 }, { paidTurns: 0, capTurns: 2 }, { paidTurns: 3, capTurns: null }]) {
      const refusals = refusalsForNextAttempt([attempt(spentOnIt)], 1)
      expect(refusals.join(' '), JSON.stringify(spentOnIt)).toContain(`max ${String(REAL_RUN_MAX_TURNS_PER_ATTEMPT)} per attempt`)
    }
    // exactly one turn per earlier attempt stays allowed (2 + 1 = 3)
    expect(refusalsForNextAttempt([attempt(), attempt()], 1)).toEqual([])
  })
})

describe('attemptsForVerifier (guard and verifier agree)', () => {
  it('gives every settled row a KNOWN count equal to what the guard charges it — an unreadable ledger is 1, never "corrupt"', () => {
    const rows = attemptsForVerifier([attempt({ paidTurns: null, capTurns: null }), attempt({ paidTurns: 0, capTurns: 1 }), attempt({ paidTurns: 1, capTurns: 1 })])
    expect(rows).toEqual([{ paidTurns: 1 }, { paidTurns: 1 }, { paidTurns: 1 }])
    expect(rows.every(row => Number.isSafeInteger(row.paidTurns) && row.paidTurns >= 0)).toBe(true)
    expect(rows.reduce((total, row) => total + row.paidTurns, 0)).toBe(spentTurns([attempt({ paidTurns: null, capTurns: null }), attempt({ paidTurns: 0, capTurns: 1 }), attempt({ paidTurns: 1, capTurns: 1 })]))
  })
})
