/**
 * TEAM-10 budget (Atlas 05/11): 1st attempt capped at the authorized ceiling, a 2nd only after an offline diagnosis, both together within the total. Pure, 0 AI.
 */
import { describe, expect, it } from 'vitest'
import { assessTeam10Attempts, authorizationFileName, chargedTurns, nextAttemptNumber, parseTeam10Authorization, planNextTeam10Attempt, spentTurns, type Team10Attempt } from '../src/team-round-budget.ts'

const AUTH = { firstCap: 14, total: 25, maxAttempts: 2 }
const attempt = (patch: Partial<Team10Attempt>): Team10Attempt => ({ at: '2026-11-05T06:00:00Z', cap: 14, paidTurns: 9, outcome: 'failed', ledgerFile: 'x', ...patch })

describe('Atlas authorization text', () => {
  it('needs TEAM-10, the first ceiling and the total — nothing is defaulted in code', () => {
    expect(parseTeam10Authorization('TEAM-10\nTeto de turnos: 14\nTotal máximo: 25\n')).toEqual({ authorization: { firstCap: 14, total: 25, maxAttempts: 2 }, problems: [] })
    expect(parseTeam10Authorization('TEAM-10\nTeto de turnos: 14').problems.join(' ')).toMatch(/Total máximo/u)
    expect(parseTeam10Authorization('Teto de turnos: 14\nTotal máximo: 25').problems.join(' ')).toMatch(/TEAM-10/u)
    expect(parseTeam10Authorization('TEAM-10\nTeto de turnos: 30\nTotal máximo: 25').problems.join(' ')).toMatch(/above the total/u)
    expect(parseTeam10Authorization('TEAM-10\nTeto de turnos: 0\nTotal máximo: 25').problems.join(' ')).toMatch(/Teto de turnos/u)
  })
})

describe('attempt 3 (Atlas 07/11): its OWN written OK names it — no constant in code grants an attempt', () => {
  // The text Keel registered from Atlas's answer (.maestri/tmp/atlas-ok-team10-3.txt), the lines the gate reads.
  const OK3 = 'TEAM-10 — OK DO ATLAS para a TENTATIVA 3 (aceite (b) da D-090)\nTeto de turnos: 14 nesta tentativa.\nTotal máximo: 17 de 25 (3 já gastos + 14).\nSem conector. Sem escrita externa.\n'
  const spent3 = [attempt({ paidTurns: 0, outcome: 'refused' }), attempt({ paidTurns: 2 }), attempt({ paidTurns: 1 })]

  it('reads the ceiling, the total (17 of 25: 3 spent + 14) and that it authorizes up to attempt 3; the original OK names none and covers two', () => {
    expect(parseTeam10Authorization(OK3)).toEqual({ authorization: { firstCap: 14, total: 17, maxAttempts: 3 }, problems: [] })
    expect(parseTeam10Authorization('TEAM-10\nTeto de turnos: 14\nTotal máximo: 25\n').authorization?.maxAttempts).toBe(2)
    expect(parseTeam10Authorization(OK3.replace('TENTATIVA 3', 'TENTATIVA 2')).authorization?.maxAttempts, 'never fewer than the original two').toBe(2)
  })

  it('the 3rd attempt is REFUSED with the original OK (naming where its own OK goes) and allowed with its own: cap 14 = 17 − 3 spent', () => {
    expect(nextAttemptNumber(spent3), 'the refused round does not count').toBe(3)
    const original = planNextTeam10Attempt(spent3, AUTH, 'diagnóstico')
    expect(original.allowed).toBe(false)
    expect(original.problems.join(' ')).toMatch(/2 attempt\(s\) are authorized and 2 were already made: attempt 3 needs its own written OK from Atlas \(\.maestri\/tmp\/atlas-ok-team10-3\.txt naming "TENTATIVA 3"\)/u)
    const own = planNextTeam10Attempt(spent3, parseTeam10Authorization(OK3).authorization!, 'pedido sem fatos; autossuficiente + driver responde + leitor')
    expect(own).toMatchObject({ allowed: true, attemptNumber: 3, cap: 14, spentSoFar: 3 })
    expect(planNextTeam10Attempt(spent3, parseTeam10Authorization(OK3).authorization!, undefined).problems.join(' '), 'still needs the offline diagnosis').toMatch(/DIAGNOSED/u)
  })

  it('a 4th attempt, or more turns than the 17, need a new OK again; file names follow the attempt', () => {
    const four = [...spent3, attempt({ paidTurns: 5 })]
    expect(planNextTeam10Attempt(four, parseTeam10Authorization(OK3).authorization!, 'x').problems.join(' ')).toMatch(/attempt 4 needs its own written OK.*atlas-ok-team10-4\.txt/u)
    expect(planNextTeam10Attempt([attempt({ paidTurns: 0, outcome: 'refused' }), attempt({ paidTurns: 2 }), attempt({ paidTurns: 15 })], parseTeam10Authorization(OK3).authorization!, 'x').problems.join(' ')).toMatch(/budget is spent/u)
    expect([1, 2, 3, 4].map(authorizationFileName)).toEqual(['atlas-ok-team10.txt', 'atlas-ok-team10.txt', 'atlas-ok-team10-3.txt', 'atlas-ok-team10-4.txt'])
  })
})

describe('plan of the next attempt', () => {
  it('the 1st attempt gets exactly the authorized ceiling and needs no diagnosis', () => {
    expect(planNextTeam10Attempt([], AUTH, undefined)).toMatchObject({ allowed: true, attemptNumber: 1, cap: 14, spentSoFar: 0 })
  })

  it('the 2nd attempt needs the offline diagnosis and gets only what is left of the total', () => {
    const failed = [attempt({ paidTurns: 12 })]
    expect(planNextTeam10Attempt(failed, AUTH, undefined)).toMatchObject({ allowed: false, cap: 0 })
    expect(planNextTeam10Attempt(failed, AUTH, '  ').problems.join(' ')).toMatch(/DIAGNOSED/u)
    expect(planNextTeam10Attempt(failed, AUTH, 'o ledger mostrou o gancho X; corrigido e provado a seco')).toMatchObject({ allowed: true, attemptNumber: 2, cap: 13, spentSoFar: 12 })
  })

  it('the 2nd attempt never gets more than the written ceiling, even when much more of the total is left (Atlas 07/11: "teto 14; total <= 25"; TEAM-10 really spent 2 of 25)', () => {
    const real = [attempt({ paidTurns: 0, outcome: 'refused' }), attempt({ paidTurns: 2 })]
    expect(planNextTeam10Attempt(real, AUTH, 'pedido truncado e ferramentas de equipe corrigidos e provados a seco')).toMatchObject({ allowed: true, attemptNumber: 2, cap: 14, spentSoFar: 2 })
    expect(planNextTeam10Attempt([attempt({ paidTurns: 11 })], AUTH, 'x')).toMatchObject({ allowed: true, cap: 14, spentSoFar: 11 })
    expect(planNextTeam10Attempt([attempt({ paidTurns: 12 })], AUTH, 'x')).toMatchObject({ allowed: true, cap: 13 })
  })

  it('an attempt that never settled (crash) or has no readable ledger is charged its WHOLE cap', () => {
    const crashed = [attempt({ paidTurns: null, outcome: 'started' })]
    expect(chargedTurns(crashed[0]!)).toBe(14)
    expect(planNextTeam10Attempt(crashed, AUTH, 'diagnóstico')).toMatchObject({ allowed: true, cap: 11, spentSoFar: 14 })
  })

  it('the total can never be exceeded and a 3rd attempt, a repeat after green or an empty budget are refused', () => {
    expect(planNextTeam10Attempt([attempt({ paidTurns: 14 }), attempt({ paidTurns: 11 })], AUTH, 'x').problems.join(' ')).toMatch(/2 attempts|budget is spent/u)
    expect(planNextTeam10Attempt([attempt({ outcome: 'passed' })], AUTH, 'x').problems.join(' ')).toMatch(/already PASSED/u)
    expect(planNextTeam10Attempt([attempt({ paidTurns: 25 })], AUTH, 'x').problems.join(' ')).toMatch(/budget is spent/u)
    expect(spentTurns([attempt({ paidTurns: 14 }), attempt({ paidTurns: 11 })])).toBe(25)
  })
})

describe('a round the preflight refused', () => {
  it('spends nothing and does not use up the attempt: the next one is still the 1st, with the full ceiling', () => {
    const refused = [attempt({ paidTurns: 0, outcome: 'refused' })]
    expect(planNextTeam10Attempt(refused, AUTH, undefined)).toMatchObject({ allowed: true, attemptNumber: 1, cap: 14, spentSoFar: 0 })
    // ...but a refusal that ever booked turns is still charged, and a refusal followed by a real failure leads to the 2nd attempt as usual
    expect(planNextTeam10Attempt([attempt({ paidTurns: 3, outcome: 'refused' })], AUTH, undefined)).toMatchObject({ attemptNumber: 1, cap: 14, spentSoFar: 3 })
    expect(planNextTeam10Attempt([...refused, attempt({ paidTurns: 12 })], AUTH, 'diagnóstico')).toMatchObject({ allowed: true, attemptNumber: 2, cap: 13 })
  })
})

describe('the attempts file', () => {
  it('absent = empty; anything malformed is a problem (fail closed, never an empty budget)', () => {
    expect(assessTeam10Attempts(undefined)).toEqual({ attempts: [], problems: [] })
    expect(assessTeam10Attempts({}).problems).not.toEqual([])
    expect(assessTeam10Attempts([{ at: 'x', cap: 'y', paidTurns: 1, outcome: 'failed' }]).problems).not.toEqual([])
    expect(assessTeam10Attempts([{ at: 'x', cap: 14, paidTurns: 1, outcome: 'maybe' }]).problems).not.toEqual([])
    expect(assessTeam10Attempts([attempt({})]).problems).toEqual([])
  })
})
