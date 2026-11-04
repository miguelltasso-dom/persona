/** Persona Configurações › Sobre: external links and THIRD_PARTY_NOTICES (kit de lançamento). */

import { ipcMain, shell, type BrowserWindow } from 'electron'
import { assertDesktopSender, DESKTOP_IPC } from './ipc.ts'
import { resolveThirdPartyNoticesPath } from './legal-notices.ts'
import { isExternalHttpUrl } from './secure-shell.ts'

function ownedWindow(
  getWindow: () => BrowserWindow | undefined,
  event: { readonly sender: unknown; readonly senderFrame: unknown },
): BrowserWindow {
  const window = getWindow()
  if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('dsh desktop: rejected persona about IPC from an unowned renderer')
  }
  return window
}

/**
 * IPC for {@link AboutPersona}: confirmed `shell.openExternal` and opening bundled notices.
 * @param getWindow - Local app window (same ownership rules as the directory picker).
 * @param host - Resources path and localized confirm copy.
 */
export function installPersonaAboutShellIpc(
  getWindow: () => BrowserWindow | undefined,
  host: {
    readonly resourcesPath: string
    readonly importMetaUrl: string
    readonly openExternalConfirm: (window: BrowserWindow, url: string) => Promise<boolean>
  },
): void {
  ipcMain.handle(DESKTOP_IPC.shellOpenExternal, async (event, rawUrl: unknown) => {
    const window = ownedWindow(getWindow, event)
    assertDesktopSender(event, ['app'])
    if (typeof rawUrl !== 'string' || !isExternalHttpUrl(rawUrl)) return false
    const allowed = await host.openExternalConfirm(window, rawUrl)
    if (allowed) await shell.openExternal(rawUrl)
    return allowed
  })

  ipcMain.handle(DESKTOP_IPC.openThirdPartyNotices, async (event) => {
    ownedWindow(getWindow, event)
    assertDesktopSender(event, ['app'])
    const path = await resolveThirdPartyNoticesPath(host.resourcesPath, host.importMetaUrl)
    if (path === undefined) return false
    const result = await shell.openPath(path)
    return result === ''
  })
}
