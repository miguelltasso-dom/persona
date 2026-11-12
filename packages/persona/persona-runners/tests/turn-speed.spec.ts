import { describe, expect, it } from 'vitest'
import { decidedSpeed, speedArgsOf, speedForTurn, speedLaunchArgs, type TurnSpeedInput } from '../src/resolve/turn-speed.ts'

/** Item 9c: the faster tier (about 2.5x the plan's window) only in a live conversation, never in work nobody waits on. */
const ASKED: TurnSpeedInput = { cli: 'codex', requested: 'fast', purpose: 'talk' }

describe('turn speed (fast só ao vivo)', () => {
  it('a persona who asked for fast gets it ONLY in a live conversation on Codex', () => {
    expect(speedForTurn(ASKED)).toBe('fast')
    expect(speedForTurn({ ...ASKED, purpose: 'task' })).toBe('standard') // a Task: nobody is waiting
    expect(speedForTurn({ ...ASKED, purpose: 'review' })).toBe('standard')
    expect(speedForTurn({ ...ASKED, purpose: 'routine' })).toBe('standard')
  })

  it('background work is standard even when it is the persona\'s conversation turn that moved there', () => {
    expect(speedForTurn({ ...ASKED, background: true })).toBe('standard')
  })

  it('an engine without a faster tier, a key sign-in and a persona who never asked are all standard', () => {
    expect(speedForTurn({ ...ASKED, cli: 'claude' })).toBe('standard')
    expect(speedForTurn({ ...ASKED, cli: 'cursor' })).toBe('standard')
    expect(speedForTurn({ ...ASKED, account: 'api' })).toBe('standard')
    expect(speedForTurn({ ...ASKED, requested: undefined })).toBe('standard')
    expect(speedForTurn({ ...ASKED, requested: 'standard' })).toBe('standard')
  })

  it('a persona who never asked gets NOTHING added: no argument at all (zero behaviour change by default)', () => {
    for (const purpose of ['talk', 'task']) {
      expect(speedLaunchArgs({ cli: 'codex', requested: undefined, purpose })).toEqual([])
      expect(decidedSpeed({ cli: 'codex' }, purpose)).toBeUndefined()
      expect(speedArgsOf('codex', decidedSpeed({ cli: 'codex' }, purpose))).toEqual([])
    }
    expect(speedLaunchArgs({ ...ASKED, requested: 'standard' })).toEqual([])
    expect(speedLaunchArgs({ ...ASKED, cli: 'claude' })).toEqual([])
    expect(decidedSpeed({ cli: 'claude', speed: 'fast' }, 'talk')).toBeUndefined() // an engine without the tier carries nothing
  })

  it('the arguments are the explicit tier: fast on a live turn, EXPLICIT standard on a work turn (a Codex thread keeps its tier across turns)', () => {
    expect(speedLaunchArgs(ASKED)).toEqual(['-c', 'service_tier="fast"', '-c', 'features.fast_mode=true'])
    expect(speedLaunchArgs({ ...ASKED, purpose: 'task' })).toEqual(['-c', 'features.fast_mode=false'])
  })

  it('the spec of a runner carries the DECIDED speed: talk is fast, task is standard, for the same persona', () => {
    const persona = { cli: 'codex', speed: 'fast' as const }
    expect(decidedSpeed(persona, 'talk')).toBe('fast')
    expect(decidedSpeed(persona, 'task')).toBe('standard')
    expect(speedArgsOf('codex', decidedSpeed(persona, 'task'))).toEqual(['-c', 'features.fast_mode=false'])
    expect(speedArgsOf('claude', 'fast')).toEqual([]) // never sent to an engine that does not have it
  })
})
