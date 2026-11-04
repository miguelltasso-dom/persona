import { describe, expect, it } from 'vitest'
import { exhaustionOf, proposeAccountSwaps, type SwapAccount, type SwapWaiting } from '../src/account-swap.ts'

function account(id: string, extra: Partial<SwapAccount> = {}): SwapAccount {
  return { id, label: `Conta ${id}`, loggedIn: true, status: 'ok', ...extra }
}

function waiting(accounts: SwapAccount[], extra: Partial<SwapWaiting> = {}): SwapWaiting {
  return {
    ticketId: 't1', ticketTitle: 'Montar o cardápio', personaId: 'nina', personaName: 'Nina', provider: 'claude',
    accountId: 'a', accounts, policy: 'ask_before_swap', ...extra,
  }
}

describe('what an account window says', () => {
  it('a window at 100% is out, windows below 100% have room, no windows is unknown (never assumed free)', () => {
    expect(exhaustionOf([{ usedPercent: 100, resetsAt: '2026-11-04T20:00:00.000Z' }, { usedPercent: 40 }])).toEqual({ exhausted: true, resetsAt: '2026-11-04T20:00:00.000Z' })
    expect(exhaustionOf([{ usedPercent: 30 }, { usedPercent: 99 }])).toEqual({ exhausted: false })
    expect(exhaustionOf([])).toEqual({})
    expect(exhaustionOf([{ resetsAt: '2026-11-04T20:00:00.000Z' }])).toEqual({})
  })

  it('an exhausted window with no clock leaves the reset unknown instead of picking another window\'s', () => {
    expect(exhaustionOf([{ usedPercent: 100 }, { usedPercent: 100, resetsAt: '2026-11-04T20:00:00.000Z' }])).toEqual({ exhausted: true })
  })
})

describe('proposing "usar a outra conta e retomar agora"', () => {
  it('offers the other logged-in account that has room', () => {
    const [proposal] = proposeAccountSwaps([waiting([account('a', { exhausted: true }), account('b', { exhausted: false })])])
    expect(proposal).toMatchObject({
      ticketId: 't1', personaName: 'Nina', policy: 'ask_before_swap',
      from: { accountId: 'a', label: 'Conta a' }, to: { accountId: 'b', label: 'Conta b', quota: 'livre' }, alternatives: [],
    })
  })

  it('never offers an account that is out, not logged in or in error; and says "desconhecida" when the vendor published nothing', () => {
    const accounts = [
      account('a'), account('out', { exhausted: true }), account('anon', { loggedIn: false }), account('bad', { status: 'error' }),
      account('unknown'),
    ]
    const [proposal] = proposeAccountSwaps([waiting(accounts)])
    expect(proposal?.to).toEqual({ accountId: 'unknown', label: 'Conta unknown', quota: 'desconhecida' })
    expect(proposal?.alternatives).toEqual([])
  })

  it('puts an account known to have room before one nobody knows anything about, and keeps the rest as alternatives', () => {
    const [proposal] = proposeAccountSwaps([waiting([account('a'), account('mystery'), account('free', { exhausted: false }), account('free2', { exhausted: false })])])
    expect(proposal?.to.accountId).toBe('free')
    expect(proposal?.alternatives.map(option => option.accountId)).toEqual(['free2', 'mystery'])
  })

  it('proposes nothing without somewhere to go, or with a fixed-account policy (the person asked for that account)', () => {
    expect(proposeAccountSwaps([waiting([account('a')])])).toEqual([])
    expect(proposeAccountSwaps([waiting([account('a', { exhausted: true }), account('b', { exhausted: false })], { policy: 'fixed' })])).toEqual([])
    expect(proposeAccountSwaps([waiting([])])).toEqual([])
  })

  it('every non-fixed policy only PROPOSES: the default policy is not a choice the person made', () => {
    for (const policy of ['next_on_limit', 'round_robin', 'ask_before_swap'] as const) {
      const [proposal] = proposeAccountSwaps([waiting([account('a'), account('b', { exhausted: false })], { policy })])
      expect(proposal?.policy).toBe(policy)
      expect(proposal?.to.accountId).toBe('b')
    }
  })

  it('keeps the reset clock so the person can choose "esperar até {hora}" instead', () => {
    const [fromWait] = proposeAccountSwaps([waiting([account('a'), account('b', { exhausted: false })], { resetAt: '2026-11-04T20:00:00.000Z' })])
    expect(fromWait?.waitUntil).toBe('2026-11-04T20:00:00.000Z')
    const [fromAccount] = proposeAccountSwaps([waiting([account('a', { resetsAt: '2026-11-04T21:00:00.000Z' }), account('b', { exhausted: false })])])
    expect(fromAccount?.waitUntil).toBe('2026-11-04T21:00:00.000Z')
    const [none] = proposeAccountSwaps([waiting([account('a'), account('b', { exhausted: false })])])
    expect(none?.waitUntil).toBeUndefined()
  })

  it('without a recorded account the first one is the one that ran out; one proposal per waiting Task, in order', () => {
    const accounts = [account('a'), account('b', { exhausted: false })]
    const { accountId, ...unrecorded } = waiting(accounts, { ticketId: 't2' })
    void accountId
    const rows: SwapWaiting[] = [waiting(accounts, { ticketId: 't1' }), unrecorded]
    const proposals = proposeAccountSwaps(rows)
    expect(proposals.map(row => row.ticketId)).toEqual(['t1', 't2'])
    expect(proposals[1]?.from.accountId).toBe('a')
  })
})
