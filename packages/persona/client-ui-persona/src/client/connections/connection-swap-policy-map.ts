import type { RunnerSwapPolicy } from '../data/adapters/connection-accounts.ts'
import type { AccountPolicy } from '../primitives/Accounts.tsx'

/** Host `RunnerSwapPolicy` ↔ Muse `AccountPolicy` (round_robin = split_balance). */
export function runnerSwapPolicyToAccountPolicy(policy: RunnerSwapPolicy): AccountPolicy {
  switch (policy) {
    case 'round_robin': return 'split_balance'
    case 'ask_before_swap': return 'ask'
    case 'fixed': return 'fixed'
    case 'next_on_limit': return 'next_on_limit'
    default: {
      const _unknown: never = policy
      return _unknown
    }
  }
}

export function accountPolicyToRunnerSwapPolicy(policy: AccountPolicy): RunnerSwapPolicy {
  switch (policy) {
    case 'split_balance': return 'round_robin'
    case 'ask': return 'ask_before_swap'
    case 'fixed': return 'fixed'
    case 'next_on_limit': return 'next_on_limit'
    default: {
      const _unknown: never = policy
      return _unknown
    }
  }
}
