import { describe, expect, it } from 'vitest'
import { accountPolicyToRunnerSwapPolicy, runnerSwapPolicyToAccountPolicy } from '../src/client/connections/connection-swap-policy-map.ts'

describe('connection swap policy map', () => {
  it('round-trips host and UI policies', () => {
    expect(runnerSwapPolicyToAccountPolicy('round_robin')).toBe('split_balance')
    expect(accountPolicyToRunnerSwapPolicy('split_balance')).toBe('round_robin')
    expect(runnerSwapPolicyToAccountPolicy('ask_before_swap')).toBe('ask')
    expect(accountPolicyToRunnerSwapPolicy('ask')).toBe('ask_before_swap')
  })
})
