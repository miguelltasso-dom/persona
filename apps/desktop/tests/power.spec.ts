import { describe, expect, it, vi } from 'vitest'
import { CATCH_UP_BURST, DesktopPower } from '../src/power.ts'

describe('desktop power', () => {
  it('never asks Windows to stay awake: the host is the only sleep blocker (D Keel 14:44)', async () => {
    // The old options carried a powerSaveBlocker; the module must not even know the notion any more.
    const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/power.ts', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/prevent-app-suspension|powerSaveBlocker|PowerSaveBlockerPort/u)
    const onCatchUp = vi.fn()
    const power = new DesktopPower({ onCatchUp })
    power.setRunningAssignments(3)
    expect(power.runningAssignments).toBe(3)
    power.setRunningAssignments(-1)
    expect(power.runningAssignments).toBe(0)
    power.dispose()
    expect(onCatchUp).not.toHaveBeenCalled()
  })

  it('asks the host for a burst-limited catch-up after a clock jump', () => {
    let now = 1_000
    const onCatchUp = vi.fn()
    const power = new DesktopPower({
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
