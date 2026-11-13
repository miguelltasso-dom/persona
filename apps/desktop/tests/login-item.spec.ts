import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND_ARGUMENT, DesktopLoginItem, launchedInBackground } from '../src/login-item.ts'

describe('desktop login item', () => {
  it('starts off and only enables on explicit consent', () => {
    const apply = vi.fn()
    const item = new DesktopLoginItem({ apply })
    expect(apply).toHaveBeenCalledWith({ openAtLogin: false })
    expect(item.openAtLogin).toBe(false)
    item.setOpenAtLogin(true)
    expect(item.openAtLogin).toBe(true)
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: true })
    item.setOpenAtLogin(false)
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: false })
  })

  it('the ordinary "start with Windows" opens the window: no arguments in the Run entry', () => {
    const apply = vi.fn()
    const item = new DesktopLoginItem({ apply })
    item.setOpenAtLogin(true)
    expect(item.mode).toBe('window')
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: true })
    expect(apply.mock.calls.every(call => (call[0] as { args?: unknown }).args === undefined)).toBe(true)
  })

  it('the station offer the owner accepted starts the app in the background, and turning it off clears the arguments', () => {
    const apply = vi.fn()
    const item = new DesktopLoginItem({ apply })
    item.setOpenAtLogin(true, 'background')
    expect(item.openAtLogin).toBe(true)
    expect(item.mode).toBe('background')
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: true, args: ['--background'] })
    item.setOpenAtLogin(false, 'background')
    expect(item.openAtLogin).toBe(false)
    expect(item.mode).toBe('window')
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: false })
  })

  it('a non-true consent never enables, whatever the mode', () => {
    const apply = vi.fn()
    const item = new DesktopLoginItem({ apply })
    item.setOpenAtLogin('yes' as unknown as boolean, 'background')
    expect(item.openAtLogin).toBe(false)
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: false })
  })

  it('reads the background request from the command line', () => {
    expect(BACKGROUND_ARGUMENT).toBe('--background')
    expect(launchedInBackground(['C:\\Persona\\Persona.exe'])).toBe(false)
    expect(launchedInBackground(['C:\\Persona\\Persona.exe', '--background'])).toBe(true)
    expect(launchedInBackground(['Persona.exe', '--background=1'])).toBe(false)
    expect(launchedInBackground(['Persona.exe', 'persona://open/x'])).toBe(false)
  })
})
