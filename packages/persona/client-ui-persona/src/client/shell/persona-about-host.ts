/** Host bridges for Configurações › Sobre (kit de lançamento Muse). */

import { personaDesktopBridge } from '../bring-context/persona-desktop-bridge.ts'

/** Client build version when embedded by the host bundle. */
export function personaAppVersion(): string {
  const fromEnv = process.env.DSH_CLIENT_VERSION
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim()
  return 'dev'
}

/**
 * Open an http(s) URL through the desktop shell (`shell.openExternal`); never navigates the app window.
 * @param url - Upstream project link from {@link PERSONA_CREDITS}.
 */
export function openPersonaExternalUrl(url: string): void {
  const bridge = personaDesktopBridge()
  if (bridge?.openExternal !== undefined) {
    void Promise.resolve(bridge.openExternal(url)).catch(() => undefined)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Open bundled third-party notices (desktop) or the repo markdown on web dev. */
export function openPersonaThirdPartyNotices(): void {
  const bridge = personaDesktopBridge()
  if (bridge?.openThirdPartyNotices !== undefined) {
    void Promise.resolve(bridge.openThirdPartyNotices()).catch(() => undefined)
    return
  }
  window.open('https://github.com/deepseek-ai/deepseek-harness/blob/persona-dev/THIRD_PARTY_NOTICES.md', '_blank', 'noopener,noreferrer')
}
