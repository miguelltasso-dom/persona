import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { DESKTOP_IPC } from '../src/ipc.ts'

const electron = vi.hoisted(() => ({
  handle: vi.fn(),
  openExternal: vi.fn(async () => {}),
  openPath: vi.fn(async () => ''),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
  shell: { openExternal: electron.openExternal, openPath: electron.openPath },
}))
const { installPersonaAboutShellIpc } = await import('../src/persona-about-shell.ts')

beforeEach(() => { vi.resetAllMocks() })

function fixture(confirm: boolean) {
  const frame = { url: 'dsh-app://app/' }
  const window = {
    webContents: { mainFrame: frame },
    isDestroyed: vi.fn(() => false),
  }
  let current: BrowserWindow | undefined = window as unknown as BrowserWindow
  const noticesDir = mkdtempSync(join(tmpdir(), 'persona-notices-'))
  const noticesPath = join(noticesDir, 'THIRD_PARTY_NOTICES.txt')
  writeFileSync(noticesPath, 'notice', 'utf8')
  installPersonaAboutShellIpc(() => current, {
    resourcesPath: noticesDir,
    importMetaUrl: import.meta.url,
    openExternalConfirm: async () => confirm,
  })
  const openExternal = electron.handle.mock.calls.find(call => call[0] === DESKTOP_IPC.shellOpenExternal)?.[1] as
    (event: IpcMainInvokeEvent, url: unknown) => Promise<boolean>
  const openNotices = electron.handle.mock.calls.find(call => call[0] === DESKTOP_IPC.openThirdPartyNotices)?.[1] as
    (event: IpcMainInvokeEvent) => Promise<boolean>
  expect(openExternal).toBeDefined()
  expect(openNotices).toBeDefined()
  const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  return { event, openExternal: openExternal!, openNotices: openNotices!, noticesPath, detach: () => { current = undefined } }
}

describe('Persona about shell IPC', () => {
  it('opens confirmed http(s) links externally', async () => {
    const f = fixture(true)
    await expect(f.openExternal(f.event, 'https://github.com/deepseek-ai/deepseek-harness')).resolves.toBe(true)
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith('https://github.com/deepseek-ai/deepseek-harness')
    await expect(f.openExternal(f.event, 'javascript:alert(1)')).resolves.toBe(false)
    expect(electron.openExternal).toHaveBeenCalledOnce()
  })

  it('skips shell.openExternal when the user declines', async () => {
    const f = fixture(false)
    await expect(f.openExternal(f.event, 'https://example.com/')).resolves.toBe(false)
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it('opens bundled THIRD_PARTY_NOTICES with shell.openPath', async () => {
    const f = fixture(true)
    await expect(f.openNotices(f.event)).resolves.toBe(true)
    expect(electron.openPath).toHaveBeenCalledExactlyOnceWith(f.noticesPath)
  })
})
