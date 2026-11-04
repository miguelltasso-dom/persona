import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { directoryPickTitle, isAllowedRevealPath } from '../src/directory-picker.ts'

const electron = vi.hoisted(() => ({
  handle: vi.fn<(
    channel: string,
    handler: (event: IpcMainInvokeEvent, request?: unknown) => Promise<string | null | boolean>,
  ) => void>(),
  showOpenDialog: vi.fn<(window: BrowserWindow, options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>(),
  showItemInFolder: vi.fn<(path: string) => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
  dialog: { showOpenDialog: electron.showOpenDialog },
  shell: { showItemInFolder: electron.showItemInFolder },
}))
const { installDesktopDirectoryPicker } = await import('../src/directory-picker.ts')

beforeEach(() => { vi.resetAllMocks() })

function fixture(host: {
  personaHome?: string
  projectRoots?: readonly string[]
  dialog?: { showOpenDialog: typeof electron.showOpenDialog }
  revealInFolder?: (path: string) => void
} = {}) {
  const frame = { url: 'dsh-app://app/' }
  const window = {
    webContents: { mainFrame: frame },
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  }
  let current: BrowserWindow | undefined = window as unknown as BrowserWindow
  const home = host.personaHome ?? mkdtempSync(join(tmpdir(), 'persona-pick-'))
  const roots = host.projectRoots
  const chooser = host.dialog
  const revealFn = host.revealInFolder
  installDesktopDirectoryPicker(() => current, {
    personaHome: () => home,
    ...(roots === undefined ? {} : { projectRoots: () => roots }),
    ...(chooser === undefined ? {} : { dialog: chooser }),
    ...(revealFn === undefined ? {} : { revealInFolder: revealFn }),
  })
  const pick = electron.handle.mock.calls.find(call => call[0] === DESKTOP_IPC.directoryPick)?.[1]
  const reveal = electron.handle.mock.calls.find(call => call[0] === DESKTOP_IPC.revealInFolder)?.[1]
  expect(pick).toBeDefined()
  expect(reveal).toBeDefined()
  const event = { sender: window.webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  return {
    window,
    frame,
    event,
    home,
    pick: pick!,
    reveal: reveal!,
    detach: () => { current = undefined },
  }
}

describe('Desktop directory picker', () => {
  it('restores and focuses the parent window and shares an unanswered dialog', async () => {
    const f = fixture()
    f.window.isMinimized.mockReturnValue(true)
    let settle!: (value: OpenDialogReturnValue) => void
    electron.showOpenDialog.mockImplementation(() => new Promise((resolve) => { settle = resolve }))
    const first = f.pick(f.event)
    const second = f.pick(f.event)
    expect(electron.showOpenDialog).toHaveBeenCalledExactlyOnceWith(f.window, { properties: ['openDirectory', 'createDirectory'] })
    expect(f.window.restore).toHaveBeenCalledOnce()
    expect(f.window.show).toHaveBeenCalledOnce()
    expect(f.window.focus).toHaveBeenCalledOnce()
    settle({ canceled: false, filePaths: ['/workspace'] })
    await expect(Promise.all([first, second])).resolves.toEqual([resolve('/workspace'), resolve('/workspace')])
    electron.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await expect(f.pick(f.event)).resolves.toBeNull()
    expect(electron.showOpenDialog).toHaveBeenCalledTimes(2)
  })

  it('forwards SB-6 "Exportar vault" as the native dialog title', async () => {
    const showOpenDialog = vi.fn<(window: BrowserWindow, options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(tmpdir(), 'obsidian-vault')] })
    const f = fixture({ dialog: { showOpenDialog } })
    await expect(f.pick(f.event, { title: 'Exportar vault' })).resolves.toBe(resolve(join(tmpdir(), 'obsidian-vault')))
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith(f.window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Exportar vault',
    })
  })

  it('maps purpose vault/export to the native dialog title', async () => {
    const showOpenDialog = vi.fn<(window: BrowserWindow, options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(tmpdir(), 'vault-obsidian')] })
    const f = fixture({ dialog: { showOpenDialog } })
    expect(directoryPickTitle({ purpose: 'vault' })).toBe('Escolher pasta do vault')
    expect(directoryPickTitle({ purpose: 'export' })).toBe('Exportar vault')
    await expect(f.pick(f.event, { purpose: 'vault' })).resolves.toBe(resolve(join(tmpdir(), 'vault-obsidian')))
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith(f.window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Escolher pasta do vault',
    })
  })

  it('forwards BYC "Escolher pasta" as the native dialog title', async () => {
    const showOpenDialog = vi.fn<(window: BrowserWindow, options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(tmpdir(), 'vault-obsidian')] })
    const f = fixture({ dialog: { showOpenDialog } })
    await expect(f.pick(f.event, { title: 'Escolher pasta' })).resolves.toBe(resolve(join(tmpdir(), 'vault-obsidian')))
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith(f.window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Escolher pasta',
    })
  })

  it('forwards a title to an injected dialog and does not persist the path', async () => {
    const showOpenDialog = vi.fn<(window: BrowserWindow, options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(tmpdir(), 'novo-projeto')] })
    const f = fixture({ dialog: { showOpenDialog } })
    await expect(f.pick(f.event, { title: 'Novo projeto' })).resolves.toBe(resolve(join(tmpdir(), 'novo-projeto')))
    expect(showOpenDialog).toHaveBeenCalledExactlyOnceWith(f.window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Novo projeto',
    })
    expect(electron.showOpenDialog).not.toHaveBeenCalled()
  })

  it('releases a failed dialog so the user can retry', async () => {
    const f = fixture()
    electron.showOpenDialog.mockRejectedValueOnce(new Error('chooser failed'))
    await expect(f.pick(f.event)).rejects.toThrow('chooser failed')
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    await expect(f.pick(f.event)).resolves.toBeNull()
  })

  it('discards the selected path after the parent is destroyed', async () => {
    const f = fixture()
    electron.showOpenDialog.mockImplementation(async () => {
      f.window.isDestroyed.mockReturnValue(true)
      return { canceled: false, filePaths: ['/workspace'] }
    })
    await expect(f.pick(f.event)).resolves.toBeNull()
  })

  it('rejects other windows, subframes, shell pages, remote pages, and missing windows', async () => {
    const f = fixture()
    await expect(f.pick({ ...f.event, sender: {} } as IpcMainInvokeEvent)).rejects.toThrow('unowned renderer')
    await expect(f.pick({ ...f.event, senderFrame: {} } as IpcMainInvokeEvent)).rejects.toThrow('unowned renderer')
    for (const url of ['dsh-app://shell/startup.html', 'https://example.com/', 'http://127.0.0.1/']) {
      f.frame.url = url
      await expect(f.pick(f.event)).rejects.toThrow('unowned renderer')
    }
    f.window.isDestroyed.mockReturnValue(true)
    await expect(f.pick(f.event)).rejects.toThrow('unowned renderer')
    f.detach()
    await expect(f.pick(f.event)).rejects.toThrow('unowned renderer')
    expect(electron.showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('revealInFolder', () => {
  it('reveals only PERSONA_HOME, a host-registered project, or a session pick', async () => {
    const revealInFolder = vi.fn<(path: string) => void>()
    const project = mkdtempSync(join(tmpdir(), 'persona-proj-'))
    const f = fixture({ projectRoots: [project], revealInFolder })
    const insideHome = join(f.home, 'logs', 'persona.log')
    const insideProject = join(project, 'README.md')
    const outside = join(tmpdir(), 'not-a-project', 'secret.txt')
    await expect(f.reveal(f.event, insideHome)).resolves.toBe(true)
    await expect(f.reveal(f.event, insideProject)).resolves.toBe(true)
    await expect(f.reveal(f.event, outside)).resolves.toBe(false)
    await expect(f.reveal(f.event, '..')).resolves.toBe(false)
    await expect(f.reveal(f.event, 12)).resolves.toBe(false)
    expect(revealInFolder.mock.calls.map(call => call[0])).toEqual([resolve(insideHome), resolve(insideProject)])
    expect(electron.showItemInFolder).not.toHaveBeenCalled()

    const picked = join(tmpdir(), 'just-picked')
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [picked] })
    await expect(f.pick(f.event)).resolves.toBe(resolve(picked))
    await expect(f.reveal(f.event, join(picked, 'src'))).resolves.toBe(true)
    expect(revealInFolder).toHaveBeenCalledWith(resolve(join(picked, 'src')))
  })

  it('rejects reveal from an unowned renderer', async () => {
    const revealInFolder = vi.fn<(path: string) => void>()
    const f = fixture({ revealInFolder })
    await expect(f.reveal({ ...f.event, sender: {} } as IpcMainInvokeEvent, f.home)).rejects.toThrow('unowned renderer')
    expect(revealInFolder).not.toHaveBeenCalled()
  })
})

describe('isAllowedRevealPath', () => {
  it('rejects siblings that only share a prefix', () => {
    expect(isAllowedRevealPath('/persona-home', '/persona-home')).toBe(true)
    expect(isAllowedRevealPath('/persona-home', '/persona-home/logs')).toBe(true)
    expect(isAllowedRevealPath('/persona-home', '/persona-home-evil')).toBe(false)
    expect(isAllowedRevealPath('/persona-home', '/tmp/other')).toBe(false)
  })
})
