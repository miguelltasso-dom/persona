// COLHEITA 5: the motor of "Segure para enviar" (1,2 s, once, a short click never sends) and the deadline seal.
import { describe, expect, it, vi } from 'vitest'
import { approvalDeadline, createHoldMachine, deadlineTime, HOLD_APPROVE_MS, type HoldPhase, type HoldTimers } from '../src/client/chat/hold-approve.ts'

/** A manual clock: timers fire only when the test advances it. */
function clock(): HoldTimers & { advance: (ms: number) => void; pending: () => number } {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; run: () => void }>()
  return {
    set: (run, ms) => { const id = next++; timers.set(id, { at: now + ms, run }); return id },
    clear: (handle) => { timers.delete(handle as number) },
    advance: (ms) => {
      now += ms
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run() }
    },
    pending: () => timers.size,
  }
}

describe('createHoldMachine', () => {
  it('completes only after the whole 1,2 s and fires onComplete once', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const phases: HoldPhase[] = []
    const machine = createHoldMachine({ timers, onComplete, onPhase: phase => phases.push(phase) })
    machine.press()
    timers.advance(HOLD_APPROVE_MS - 1)
    expect(onComplete).not.toHaveBeenCalled()
    expect(machine.phase()).toBe('holding')
    timers.advance(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(machine.phase()).toBe('done')
    expect(phases).toEqual(['holding', 'done'])
    timers.advance(10_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('letting go early cancels: nothing is approved and the next press starts from zero', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const machine = createHoldMachine({ timers, onComplete })
    machine.press()
    timers.advance(900)
    expect(machine.release()).toBe('early')
    expect(machine.phase()).toBe('idle')
    expect(timers.pending()).toBe(0)
    timers.advance(5_000)
    expect(onComplete).not.toHaveBeenCalled()
    machine.press()
    timers.advance(900) // 900 + 900 would pass 1,2 s if the first press leaked
    expect(onComplete).not.toHaveBeenCalled()
    timers.advance(300)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('a short click (press and release at once) never completes', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const machine = createHoldMachine({ timers, onComplete })
    machine.press()
    expect(machine.release()).toBe('early')
    timers.advance(HOLD_APPROVE_MS * 3)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('once done it cannot approve a second time: a new press, a release and a cancel are all ignored until reset', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const machine = createHoldMachine({ timers, onComplete })
    machine.press()
    timers.advance(HOLD_APPROVE_MS)
    machine.press()
    expect(machine.release()).toBe('none')
    machine.cancel()
    timers.advance(HOLD_APPROVE_MS * 2)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(machine.phase()).toBe('done')
    // the decision failed: the person may hold again, and that is a second, deliberate approval
    machine.reset()
    expect(machine.phase()).toBe('idle')
    machine.press()
    timers.advance(HOLD_APPROVE_MS)
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('cancel (focus lost, pointer left) stops the press like letting go, without being "early"', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const machine = createHoldMachine({ timers, onComplete })
    machine.press()
    machine.cancel()
    expect(machine.phase()).toBe('idle')
    expect(machine.release()).toBe('none')
    timers.advance(HOLD_APPROVE_MS * 2)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('a second press while holding does not restart or double the timer', () => {
    const timers = clock()
    const onComplete = vi.fn()
    const machine = createHoldMachine({ timers, onComplete })
    machine.press()
    timers.advance(600)
    machine.press()
    expect(timers.pending()).toBe(1)
    timers.advance(600)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})

describe('approvalDeadline', () => {
  const at = (day: number, hour: number, minute = 0): Date => new Date(2026, 10, day, hour, minute, 0, 0)
  const iso = (date: Date): string => date.toISOString()

  it('without a valid deadline there is no seal', () => {
    expect(approvalDeadline(undefined, at(11, 9).getTime())).toBeUndefined()
    expect(approvalDeadline('amanhã', at(11, 9).getTime())).toBeUndefined()
  })

  it('"Vale até hoje, 18h" and "amanhã, 9h" by the person\'s own calendar day', () => {
    expect(approvalDeadline(iso(at(11, 18)), at(11, 9).getTime())).toEqual({ state: 'normal', day: 'today', time: '18h', date: '11/11' })
    expect(approvalDeadline(iso(at(12, 9)), at(11, 10).getTime())).toEqual({ state: 'normal', day: 'tomorrow', time: '9h', date: '12/11' })
    expect(approvalDeadline(iso(at(14, 9, 30)), at(11, 10).getTime())).toEqual({ state: 'normal', day: 'date', time: '9h30', date: '14/11' })
  })

  it('under 1 h it counts minutes (rounded up, never "0 min") and turns amber', () => {
    expect(approvalDeadline(iso(at(11, 18)), at(11, 17, 20).getTime())).toEqual({ state: 'soon', minutes: 40 })
    expect(approvalDeadline(iso(at(11, 18)), at(11, 17, 59).getTime() + 30_000)).toEqual({ state: 'soon', minutes: 1 })
    // exactly 1 h left is still the normal seal
    expect(approvalDeadline(iso(at(11, 18)), at(11, 17).getTime())).toMatchObject({ state: 'normal' })
  })

  it('at the deadline and after it, it is expired', () => {
    expect(approvalDeadline(iso(at(11, 18)), at(11, 18).getTime())).toEqual({ state: 'expired' })
    expect(approvalDeadline(iso(at(11, 18)), at(11, 19).getTime())).toEqual({ state: 'expired' })
  })

  it('deadlineTime writes hours without a zero and minutes with two digits', () => {
    expect(deadlineTime(at(11, 9))).toBe('9h')
    expect(deadlineTime(at(11, 18, 5))).toBe('18h05')
  })
})
