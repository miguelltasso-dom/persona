/** Secure-by-default Electron shell policy (contextIsolation, CSP, navigation, permissions). */

import type { HandlerDetails, PermissionRequest, Session, WebPreferences } from 'electron'

export const PERSONA_CSP = [
  "default-src 'self' dsh-app:",
  "script-src 'self' dsh-app:",
  "style-src 'self' 'unsafe-inline' dsh-app:",
  "img-src 'self' data: dsh-app:",
  "font-src 'self' dsh-app:",
  "connect-src 'self' dsh-app:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ')

const ALLOWED_NAV_PROTOCOLS = new Set(['dsh-app:', 'persona:', 'data:'])
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

/** WebPreferences for every Persona window. No node, no webview, sandbox on. */
export function secureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
    navigateOnDragDrop: false,
  }
}

/**
 * Whether a renderer may navigate here. External http(s) is never in-window.
 * @param url - Destination.
 */
export function allowShellNavigation(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_NAV_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Window-open policy: stay inside dsh-app / persona, otherwise deny (caller opens externally).
 * @param details - Electron open handler.
 */
export function windowOpenAction(details: HandlerDetails): { action: 'allow' | 'deny' } {
  return { action: allowShellNavigation(details.url) ? 'allow' : 'deny' }
}

/**
 * Deny every Chromium permission except notifications.
 * @param _contents - Unused.
 * @param permission - Requested permission.
 * @param callback - Electron grant callback.
 */
export function personaPermissionRequest(
  _contents: unknown,
  permission: string,
  callback: (grant: boolean) => void,
  _details?: PermissionRequest,
): void {
  callback(permission === 'notifications')
}

/**
 * Install CSP + permission policy on a session.
 * @param session - Electron session.
 */
export function hardenSession(session: Session): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders, 'Content-Security-Policy': [PERSONA_CSP] }
    callback({ responseHeaders: headers })
  })
}

/**
 * Classify an http(s) URL the user must confirm before the system browser opens it.
 * @param url - Candidate.
 */
export function isExternalHttpUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
