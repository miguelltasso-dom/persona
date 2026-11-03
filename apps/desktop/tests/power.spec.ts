import { describe, expect, it, vi } from 'vitest'
import { CATCH_UP_BURST, DesktopPower } from '../src/power.ts'

describe('desktop power', () => {
  it('blocks app suspension only while an assignment is running', () => {
    const blocker = { start: vi.fn(() => 7), stop: vi.fn(() => true) }
    const power = new DesktopPower({ blocker, onCatchUp: vi.fn() })
    power.setRunningAssignments(0)
    expect(blocker.start).not.toHaveBeenCalled()
    power.setRunningAssignments(2)
    expect(blocker.start).toHaveBeenCalledOnce()
    expect(blocker.start).toHaveBeenCalledWith('prevent-app-suspension')
    power.setRunningAssignments(1)
    expect(blocker.stop).not.toHaveBeenCalled()
    power.setRunningAssignments(0)
    expect(blocker.stop).toHaveBeenCalledWith(7)
  })

  it('asks the host for a burst-limited catch-up after a clock jump', () => {
    let now = 1_000
    const onCatchUp = vi.fn()
    const power = new DesktopPower({
      blocker: { start: vi.fn(() => 1), stop: vi.fn(() => true) },
      onCatchUp,
      clock: () => now,
      burst: CATCH_UP_BURST,
    })
    now = 1_000 + 90_000
    power.onResume(now)
    expect(onCatchUp).toHaveBeenCalledWith(3)
  })

  it('polls catch-up only after a clock jump, not on every tick', () => {
    let now = 1_000
    const onCatchUp = vi.fn()
    const power = new DesktopPower({
      blocker: { start: vi.fn(() => 1), stop: vi.fn(() => true) },
      onCatchUp,
      clock: () => now,
    })
    power.poll()
    expect(onCatchUp).not.toHaveBeenCalled()
    now = 1_000 + 90_000
    power.poll()
    expect(onCatchUp).toHaveBeenCalledOnce()
    expect(onCatchUp).toHaveBeenCalledWith(3)
  })
})
