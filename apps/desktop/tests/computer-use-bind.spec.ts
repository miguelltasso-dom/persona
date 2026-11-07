import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { COMPUTER_USE_IPC } from '../src/computer-use-control.ts'

const electron = vi.hoisted(() => ({
  handle: vi.fn<(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
}))

const {
  createFakeUiaPort,
  createWindowsUiaPort,
  invokeWindowsUiaNamed,
  parseUiaSnapshot,
  parseWindowsUiaCom,
  setWindowsUiaValue,
  WINDOWS_UIA_INVOKE_SCRIPT,
  WINDOWS_UIA_SETVALUE_SCRIPT,
  WINDOWS_UIA_SNAPSHOT_SCRIPT,
} = await import('../src/computer-use-uia.ts')
const { createComputerUseComHost, installComputerUseBind } = await import('../src/computer-use-bind.ts')

beforeEach(() => { vi.resetAllMocks() })

describe('W3-5 computer-use bind', () => {
  it('pauses on physical input, gates acting, and resumes only via IPC', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = {
      webContents: { mainFrame: frame },
      isDestroyed: () => false,
    }
    const closed: number[] = []
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      displays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 }],
      createWindow: () => ({
        setIgnoreMouseEvents: () => undefined,
        close: () => { closed.push(1) },
      }),
    })
    bind.control.begin('nina')
    expect(bind.onHook({ synthesized: true })).toEqual([])
    expect(bind.held()).toBe(false)
    expect(bind.onHook({})).toEqual(['nina'])
    expect(bind.held()).toBe(true)
    const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
    const resume = electron.handle.mock.calls.find(call => call[0] === COMPUTER_USE_IPC.resume)?.[1]
    expect(resume?.(event, 'nina')).toBe(true)
    expect(bind.held()).toBe(false)
    bind.close()
    expect(closed).toEqual([1])
  })

  it('loads the Muse cursor renderer into each overlay window', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = {
      webContents: { mainFrame: frame },
      isDestroyed: () => false,
    }
    const loaded: string[] = []
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      displays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 }],
      createWindow: () => ({
        setIgnoreMouseEvents: () => undefined,
        close: () => undefined,
        loadURL: (url) => { loaded.push(url) },
      }),
    })
    bind.control.begin('nina')
    expect(loaded).toHaveLength(1)
    expect(decodeURIComponent(loaded[0] ?? '')).toContain('__personaOverlay')
    bind.close()
  })

  it('opens no overlay window until a persona uses the computer, and only one for several (BUG-QUIT-1)', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = { webContents: { mainFrame: frame }, isDestroyed: () => false }
    const created: string[] = []
    const closed: string[] = []
    let monitors = 1
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      displays: () => Array.from({ length: monitors }, (_, id) => ({ id, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 })),
      createWindow: () => {
        const name = `w${String(created.length)}`
        created.push(name)
        return { setIgnoreMouseEvents: () => undefined, close: () => { closed.push(name) } }
      },
    })
    // An idle app holds no full-screen, topmost, transparent window: with one alive the packaged app never finished "Sair".
    expect(created).toEqual([])
    expect(bind.overlaysOpen()).toBe(false)
    bind.close()
    expect(closed).toEqual([])

    monitors = 2 // the monitors are read when the overlay opens, not at boot
    bind.control.begin('nina')
    bind.control.begin('bento')
    expect(created).toEqual(['w0', 'w1'])
    expect(bind.overlaysOpen()).toBe(true)
    expect(bind.control.personas().map(row => row.personaId)).toEqual(['nina', 'bento'])

    bind.release()
    expect(closed).toEqual(['w0', 'w1'])
    expect(bind.overlaysOpen()).toBe(false)
    bind.release()
    bind.close()
    expect(closed).toEqual(['w0', 'w1'])

    bind.control.begin('nina') // a later use opens them again
    expect(bind.overlaysOpen()).toBe(true)
    bind.close()
    expect(closed).toEqual(['w0', 'w1', 'w2', 'w3'])
  })

  it('holds the global Devolver shortcut only while the overlay is open, so an idle Persona takes no chord from other apps', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = { webContents: { mainFrame: frame }, isDestroyed: () => false }
    const registered: string[] = []
    const freed: string[] = []
    const callbacks: Array<() => void> = []
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      createWindow: () => ({ setIgnoreMouseEvents: () => undefined, close: () => undefined }),
      registerShortcut: (accelerator, callback) => {
        registered.push(accelerator)
        callbacks.push(callback)
        return () => { freed.push(accelerator) }
      },
    })
    expect(registered).toEqual([])
    expect(bind.shortcutHeld()).toBe(false)

    bind.control.begin('nina')
    bind.control.begin('bento') // once, however many personas
    expect(registered).toEqual(['CommandOrControl+Shift+Space'])
    expect(bind.shortcutHeld()).toBe(true)

    // The chord still gives control back: the human takes over, the shortcut resumes.
    bind.onHook({})
    expect(bind.held()).toBe(true)
    callbacks[0]?.()
    expect(bind.held()).toBe(false)

    bind.release()
    expect(freed).toEqual(['CommandOrControl+Shift+Space'])
    expect(bind.shortcutHeld()).toBe(false)
    bind.close()
    expect(freed).toHaveLength(1)
  })

  it('still answers state and resume without any overlay (no window factory)', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = { webContents: { mainFrame: frame }, isDestroyed: () => false }
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {})
    bind.control.begin('nina')
    expect(bind.overlaysOpen()).toBe(false)
    const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
    const state = electron.handle.mock.calls.find(call => call[0] === COMPUTER_USE_IPC.state)?.[1]
    expect(state?.(event)).toEqual([{ personaId: 'nina', state: 'idle', progress: 0 }])
    bind.close()
  })

  it('invokes a named UIA target unless the human holds or the field is a password', async () => {
    const frame = { url: 'dsh-app://app/' }
    const window = {
      webContents: { mainFrame: frame },
      isDestroyed: () => false,
    }
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      uia: createFakeUiaPort([
        { id: '1', name: 'Salvar', role: 'button', rect: { x: 10, y: 20, width: 40, height: 10 } },
        { id: '2', name: 'Senha', role: 'edit', rect: { x: 0, y: 0, width: 8, height: 8 }, isPassword: true },
      ]),
    })
    bind.control.begin('nina')
    expect(bind.invoke('Salvar')).toEqual({
      ok: true,
      node: { id: '1', name: 'Salvar', role: 'button', rect: { x: 10, y: 20, width: 40, height: 10 } },
      point: { x: 30, y: 25 },
    })
    expect(bind.invoke('Senha')).toEqual({ ok: false, why: 'password' })
    await expect(bind.clickNamed('Salvar', async (x, y) => `${String(x)},${String(y)}`)).resolves.toBe('30,25')
    bind.onHook({})
    expect(bind.invoke('Salvar')).toEqual({ ok: false, why: 'human' })
    expect(parseUiaSnapshot([
      { id: '1', name: 'Ok', role: 'button', rect: { x: 0, y: 0, width: 2, height: 2 } },
      { id: 9 },
    ])).toEqual([{ id: '1', name: 'Ok', role: 'button', rect: { x: 0, y: 0, width: 2, height: 2 } }])
    const win = createWindowsUiaPort(() => JSON.stringify([
      { id: 'ok', name: 'Ok', role: 'button', rect: { x: 0, y: 0, width: 2, height: 2 } },
    ]))
    expect(win.find('Ok')?.id).toBe('ok')
    expect(createWindowsUiaPort(() => 'not-json').snapshot()).toEqual([])
    expect(WINDOWS_UIA_SNAPSHOT_SCRIPT).toContain('UIAutomationClient')
    expect(WINDOWS_UIA_SNAPSHOT_SCRIPT).not.toMatch(/ValuePattern|ValueProperty/u)
    expect(WINDOWS_UIA_INVOKE_SCRIPT).toContain('InvokePattern')
    expect(WINDOWS_UIA_INVOKE_SCRIPT).not.toMatch(/ValuePattern|ValueProperty/u)
    expect(WINDOWS_UIA_SETVALUE_SCRIPT).toContain('IsPasswordProperty')
    expect(WINDOWS_UIA_SETVALUE_SCRIPT).toMatch(/if \(\$pwd\) \{ "password"/u)
    expect(parseWindowsUiaCom('ok\n')).toBe('ok')
    expect(parseWindowsUiaCom('garbage')).toBe('missing')
    expect(invokeWindowsUiaNamed(() => 'ok', 'Salvar')).toBe('ok')
    expect(invokeWindowsUiaNamed(() => 'ok', 'Salvar', true)).toBe('human')
    expect(setWindowsUiaValue(() => 'password', 'Senha', 'x')).toBe('password')
    const com = installComputerUseBind(() => window as unknown as BrowserWindow, {
      invokeCom: name => name === 'Salvar' ? 'ok' : 'missing',
      setValueCom: (_name, value) => value === 'secret' ? 'password' : 'ok',
    })
    com.control.begin('nina')
    expect(com.invokeCom('Salvar')).toBe('ok')
    expect(com.setValueCom('Senha', 'secret')).toBe('password')
    com.onHook({})
    expect(com.invokeCom('Salvar')).toBe('human')
    com.close()
    bind.close()
    const calls: Array<{ command: string; env: NodeJS.ProcessEnv }> = []
    const host = createComputerUseComHost({
      spawn: (command, args, env) => {
        calls.push({ command, env })
        if (String(args.at(-1)).includes('InvokePattern')) return { stdout: 'ok', status: 0 }
        return { stdout: JSON.stringify([{ id: 'ok', name: 'Ok', role: 'button', rect: { x: 0, y: 0, width: 2, height: 2 } }]), status: 0 }
      },
    })
    expect(host.uia?.find('Ok')?.id).toBe('ok')
    expect(host.invokeCom?.('Salvar')).toBe('ok')
    expect(calls[0]?.command).toBe('powershell')
    expect(calls.some(call => call.env.PERSONA_UIA_NAME === 'Salvar')).toBe(true)
  })

  it('pauses from an injected hook and resumes via Devolver shortcut', () => {
    const frame = { url: 'dsh-app://app/' }
    const window = {
      webContents: { mainFrame: frame },
      isDestroyed: () => false,
    }
    let hook: ((event: { kind: 'mouse' | 'key'; control?: boolean; shift?: boolean; key?: string }) => void) | undefined
    let devolver: (() => void) | undefined
    const bind = installComputerUseBind(() => window as unknown as BrowserWindow, {
      subscribeHook: (listener) => {
        hook = listener
        return () => { hook = undefined }
      },
      registerShortcut: (_accelerator, callback) => {
        devolver = callback
        return () => { devolver = undefined }
      },
    })
    bind.control.begin('nina')
    hook?.({ kind: 'mouse' })
    expect(bind.held()).toBe(true)
    devolver?.()
    expect(bind.held()).toBe(false)
    bind.close()
    expect(hook).toBeUndefined()
    expect(devolver).toBeUndefined()
  })
})
