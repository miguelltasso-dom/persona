import { describe, expect, it } from 'vitest'
import { WrongMachineError, assertLocalPersonaMachine, isLocalPersonaMachine } from '../src/index.ts'

describe('E7 local persona machine', () => {
  it('allows this host and an unbound persona, refuses a friend host', () => {
    expect(isLocalPersonaMachine('', 'host-a')).toBe(true)
    expect(isLocalPersonaMachine('host-a', 'host-a')).toBe(true)
    expect(isLocalPersonaMachine('host-b', 'host-a')).toBe(false)
    expect(() => assertLocalPersonaMachine('host-b', 'host-a')).toThrow(WrongMachineError)
    expect(() => assertLocalPersonaMachine('host-a', 'host-a')).not.toThrow()
  })
})
