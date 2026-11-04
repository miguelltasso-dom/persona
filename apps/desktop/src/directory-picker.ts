/** Window-owned workspace directory dialogs for the local Desktop renderer. */

import { dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import { isAbsolute, relative, resolve } from 'node:path'
import { DESKTOP_IPC, assertDesktopSender } from './ipc.ts'
import { resolvePersonaProcessHome } from './product.ts'

/** Native open-directory chooser the picker can replace in tests. */
export interface DirectoryPickerDialog {
  showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>
}

/**
 * Persona-owned picker host. Paths are never written to disk here;
 * `setProjectRoot` on the host is the only persistence.
 */
export interface DirectoryPickerHost {
  personaHome?: () => string
  projectRoots?: () => readonly string[]
  dialog?: DirectoryPickerDialog
  revealInFolder?: (absolutePath: string) => void
}

const TITLE_MAX = 200

/**
 * True when `candidate` is the resolved `root` or a descendant of it.
 * @param root - Allowed folder (PERSONA_HOME or a host-registered project).
 * @param candidate - Absolute path the renderer asked to reveal.
 */
export function isAllowedRevealPath(root: string, candidate: string): boolean {
  if (root.trim() === '' || candidate.trim() === '') return false
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  return rel === '' || rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Install the application-lifetime directory picker and reveal IPC handlers.
 * @param getWindow - Current local application window; shell pages and subframes cannot open dialogs.
 * @param host - Persona home, optional registered project roots, and injectable Electron dialog/reveal.
 */
export function installDesktopDirectoryPicker(
  getWindow: () => BrowserWindow | undefined,
  host: DirectoryPickerHost = {},
): void {
  const pending = new WeakMap<BrowserWindow, Promise<string | null>>()
  const sessionPicks = new Set<string>()
  const chooser = host.dialog ?? dialog
  const reveal = host.revealInFolder ?? ((absolutePath: string) => { shell.showItemInFolder(absolutePath) })
  const personaHome = host.personaHome ?? (() => resolvePersonaProcessHome())

  ipcMain.handle(DESKTOP_IPC.directoryPick, async (event, request: unknown) => {
    const window = ownedWindow(getWindow, event)
    assertDesktopSender(event, ['app'])
    const existing = pending.get(window)
    if (existing !== undefined) return existing
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const title = directoryPickTitle(request)
    if (title !== undefined) options.title = title
    const result = chooser.showOpenDialog(window, options).then(
      ({ canceled, filePaths }) => {
        if (window.isDestroyed() || canceled) return null
        const picked = filePaths[0]
        if (picked === undefined || picked.trim() === '') return null
        const absolute = resolve(picked)
        sessionPicks.add(absolute)
        return absolute
      },
    ).finally(() => { pending.delete(window) })
    pending.set(window, result)
    return result
  })

  ipcMain.handle(DESKTOP_IPC.revealInFolder, async (event, rawPath: unknown) => {
    ownedWindow(getWindow, event)
    assertDesktopSender(event, ['app'])
    if (typeof rawPath !== 'string' || rawPath.trim() === '') return false
    const candidate = resolve(rawPath)
    const roots = [personaHome(), ...host.projectRoots?.() ?? [], ...sessionPicks]
    if (!roots.some(root => isAllowedRevealPath(root, candidate))) return false
    reveal(candidate)
    return true
  })
}

function ownedWindow(
  getWindow: () => BrowserWindow | undefined,
  event: { readonly sender: unknown; readonly senderFrame: unknown },
): BrowserWindow {
  const window = getWindow()
  if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('dsh desktop: rejected directory picker from an unowned renderer')
  }
  return window
}

/** Why the renderer opened the native folder dialog. */
export type DirectoryPickPurpose = 'project' | 'vault' | 'export'

/**
 * Dialog title for BYC vault, SB-6 export, or an explicit renderer title.
 * @param request - IPC payload `{ title?, purpose? }`.
 */
export function directoryPickTitle(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined
  const purpose = Reflect.get(request, 'purpose')
  if (purpose === 'vault') return 'Escolher pasta do vault'
  if (purpose === 'export') return 'Exportar vault'
  const title = Reflect.get(request, 'title')
  if (typeof title !== 'string') return undefined
  const trimmed = title.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.slice(0, TITLE_MAX)
}
