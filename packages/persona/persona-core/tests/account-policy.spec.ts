import { expect, it } from 'vitest'
import {
  accountAskNeedsYou,
  accountSwitchActivity,
  assertIsolatedHomes,
  engineSwitchHandoff,
  normalizeAccountPolicy,
  pickAccount,
} from '../src/index.ts'
import type { AccountPolicy, ProviderAccount, RunnerSwapPolicy } from '../src/index.ts'

function account(over: Partial<ProviderAccount> & Pick<ProviderAccount, 'id' | 'label'>): ProviderAccount {
  return {
    engine: 'claude',
    isolatedHome: `C:/accounts/${over.id}`,
    atLimit: false,
    remainingQuota: 80,
    ...over,
  }
}

const claudePessoal = account({ id: 'claude-pessoal', label: 'Pessoal', remainingQuota: 5, atLimit: true })
const claudeTrabalho = account({ id: 'claude-trabalho', label: 'Trabalho', remainingQuota: 90, isolatedHome: 'C:/accounts/claude-trabalho' })
const cursorPessoal = account({ id: 'cursor-pessoal', label: 'Pessoal', engine: 'cursor', remainingQuota: 70 })

function policy(over: Partial<AccountPolicy> = {}): AccountPolicy {
  return {
    scope: 'persona',
    ownerId: 'nina',
    policy: 'next_on_limit',
    preferredEngines: ['claude', 'cursor'],
    ...over,
  }
}

function pick(
  over: Omit<Partial<AccountPolicy>, 'policy'> & { policy?: AccountPolicy['policy'] | RunnerSwapPolicy },
  accounts: ProviderAccount[],
  currentAccountId: string,
) {
  const { policy: named, ...rest } = over
  return pickAccount({
    policy: { ...policy(rest), ...(named === undefined ? {} : { policy: named }) },
    accounts,
    currentAccountId,
  })
}

it('maps the host swap enum onto the domain policy', () => {
  expect(normalizeAccountPolicy('round_robin')).toBe('split_balance')
  expect(normalizeAccountPolicy('ask_before_swap')).toBe('ask')
  expect(normalizeAccountPolicy('fixed')).toBe('fixed')
})

it('two seats of the same engine keep isolated homes', () => {
  expect(claudePessoal.isolatedHome).not.toBe(claudeTrabalho.isolatedHome)
  assertIsolatedHomes([claudePessoal, claudeTrabalho])
  expect(() => assertIsolatedHomes([
    claudePessoal,
    { ...claudeTrabalho, isolatedHome: claudePessoal.isolatedHome },
  ])).toThrow('INVALID_ACCOUNT_POLICY')
  expect(() => pick({}, [
    claudePessoal,
    { ...claudeTrabalho, isolatedHome: claudePessoal.isolatedHome },
  ], claudePessoal.id)).toThrow('INVALID_ACCOUNT_POLICY')
})

it('next_on_limit switches to the other same-engine seat and logs activity without ids', () => {
  const decision = pick({}, [claudePessoal, claudeTrabalho], claudePessoal.id)
  expect(decision).toEqual({ kind: 'use', accountId: 'claude-trabalho', reason: 'next' })
  const line = accountSwitchActivity('Nina', claudeTrabalho, '18:30')
  expect(line.body).toBe('Nina passou para Claude · Trabalho até 18:30')
  expect(line.body).not.toContain(claudeTrabalho.id)
  expect(line.body).not.toContain(claudeTrabalho.isolatedHome)
})

it('fixed stops at the limit; ask becomes Precisa de você', () => {
  expect(pick({ policy: 'fixed' }, [claudePessoal, claudeTrabalho], claudePessoal.id))
    .toEqual({ kind: 'stop', accountId: 'claude-pessoal', reason: 'fixed_at_limit' })

  expect(pick({ policy: 'ask_before_swap' }, [claudePessoal, claudeTrabalho], claudePessoal.id))
    .toEqual({ kind: 'ask', fromAccountId: 'claude-pessoal', toAccountId: 'claude-trabalho' })

  const card = accountAskNeedsYou(claudePessoal, claudeTrabalho)
  expect(card.kind).toBe('account_swap')
  expect(card.title).toBe('Trocar de conta?')
  expect(card.body).toContain('Claude · Trabalho')
})

it('split_balance stays on the richer seat and handoff when the next engine differs', () => {
  const stay = pick(
    { policy: 'round_robin' },
    [
      account({ id: 'claude-a', label: 'A', remainingQuota: 90 }),
      account({ id: 'claude-b', label: 'B', remainingQuota: 10 }),
    ],
    'claude-a',
  )
  expect(stay).toEqual({ kind: 'use', accountId: 'claude-a', reason: 'current' })

  const balance = pick(
    { policy: 'split_balance' },
    [
      account({ id: 'claude-a', label: 'A', remainingQuota: 10 }),
      account({ id: 'claude-b', label: 'B', remainingQuota: 80 }),
    ],
    'claude-a',
  )
  expect(balance).toEqual({ kind: 'use', accountId: 'claude-b', reason: 'balance' })

  const switchEngine = pick(
    { policy: 'next_on_limit', preferredEngines: ['claude', 'cursor'] },
    [claudePessoal, cursorPessoal],
    claudePessoal.id,
  )
  expect(switchEngine).toEqual({
    kind: 'handoff',
    fromAccountId: 'claude-pessoal',
    toAccountId: 'cursor-pessoal',
    fromEngine: 'claude',
    toEngine: 'cursor',
  })
  const handoff = engineSwitchHandoff({
    personaId: 'nina',
    ticketId: 't-1',
    from: claudePessoal,
    to: cursorPessoal,
  })
  expect(handoff.kind).toBe('engine_switch')
  expect(handoff.fromEngine).toBe('claude')
  expect(handoff.toEngine).toBe('cursor')
  expect(handoff.objective).toContain('Cursor')
})

it('refuses an engine the persona did not accept and refuses same-engine handoff', () => {
  expect(pick({ preferredEngines: ['codex'] }, [claudePessoal], claudePessoal.id))
    .toEqual({ kind: 'stop', accountId: 'claude-pessoal', reason: 'engine_refused' })
  expect(() => engineSwitchHandoff({
    personaId: 'nina',
    ticketId: 't-1',
    from: claudePessoal,
    to: claudeTrabalho,
  })).toThrow('INVALID_ACCOUNT_POLICY')
})
