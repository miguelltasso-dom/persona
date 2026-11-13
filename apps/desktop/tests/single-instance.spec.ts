import { describe, expect, it, vi } from 'vitest'
import { claimDesktopSingleInstance, type DesktopSingleInstanceApplication } from '../src/single-instance.ts'

describe('desktop single-instance ownership', () => {
  it('quits a second process without registering lifecycle work', () => {
    const quit = vi.fn()
    const on = vi.fn()
    const application = {
      requestSingleInstanceLock: () => false,
      quit,
      on,
    } satisfies DesktopSingleInstanceApplication

    expect(claimDesktopSingleInstance(application, vi.fn())).toBe(false)
    expect(quit).toHaveBeenCalledOnce()
    expect(on).not.toHaveBeenCalled()
  })

  it('routes a later launch to the primary process', () => {
    let secondInstance: (() => void) | undefined
    const focus = vi.fn()
    const application = {
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      on: vi.fn((_event: 'second-instance', listener: () => void) => { secondInstance = listener }),
    } satisfies DesktopSingleInstanceApplication

    expect(claimDesktopSingleInstance(application, focus)).toBe(true)
    secondInstance?.()
    expect(focus).toHaveBeenCalledOnce()
  })

  /** An owner whose `second-instance` listener the test can fire with a command line. */
  function owner() {
    let secondInstance: ((event: unknown, argv: readonly string[]) => void) | undefined
    const focus = vi.fn()
    const link = vi.fn()
    const application = {
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      on: vi.fn((_event: 'second-instance', listener: (event: unknown, argv: readonly string[]) => void) => { secondInstance = listener }),
    } satisfies DesktopSingleInstanceApplication
    claimDesktopSingleInstance(application, focus, link)
    return { focus, link, launch: (argv: readonly string[]) => { secondInstance?.({}, argv) } }
  }

  it('the watchdog launch (--background) of a live owner does NOT raise its window: it is the answer "still running"', () => {
    const f = owner()
    f.launch(['C:\\Persona\\Persona.exe', '--background'])
    f.launch(['C:\\Persona\\Persona.exe', '--background'])
    expect(f.focus).not.toHaveBeenCalled()
    expect(f.link).not.toHaveBeenCalled()
  })

  it('an ordinary second launch and a persona:// link still reach the owner after a background one', () => {
    const f = owner()
    f.launch(['Persona.exe', '--background'])
    f.launch(['Persona.exe'])
    expect(f.focus).toHaveBeenCalledOnce()
    f.launch(['Persona.exe', 'persona://open/ticket/t-1'])
    expect(f.focus).toHaveBeenCalledTimes(2)
    expect(f.link).toHaveBeenCalledWith('persona://open/ticket/t-1')
  })
})
