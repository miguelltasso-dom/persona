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
    expect(loaded).toHaveLength(1)
    expect(decodeURIComponent(loaded[0] ?? '')).toContain('__personaOverlay')
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
