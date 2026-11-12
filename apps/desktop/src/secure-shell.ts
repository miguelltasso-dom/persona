/** Secure-by-default Electron shell policy (contextIsolation, CSP, navigation, permissions). */

import type { HandlerDetails, PermissionRequest, Session, WebPreferences } from 'electron'

/**
 * Script policy is intentionally tight: no `'unsafe-eval'` and no
 * `'unsafe-inline'`. Host `kind: 'script'` rows (ModuleLoader, theme) are
 * rewritten to same-origin `/__persona-boot__/N.js` files; the boot gate is
 * `/__persona-boot__/ready.js` rather than an inline tag. `blob:` stays only
 * for worker transports that already emit blob URLs. Loopback is the owned
 * Host. Theme `kind: 'style'` rows still need style `'unsafe-inline'`.
 *
 * D-114 / P1-05 (voz local, autorizado pelo Miguel em 12/11): o transcritor
 * Vosk roda num Worker empacotado no app e compila WebAssembly. Por isso:
 * `'wasm-unsafe-eval'` (só WASM, nunca `'unsafe-eval'`), `worker-src 'self' blob:`,
 * `media-src` com `blob:` (tocar o áudio gravado) e `connect-src` com `blob:`
 * (o modelo chega do host como blob). Nenhum host novo. O texto exato é travado
 * em tests/secure-shell-p1-05.spec.ts.
 */
export const PERSONA_CSP = [
  "default-src 'self' dsh-app:",
  "script-src 'self' blob: dsh-app: http://127.0.0.1:* 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' dsh-app:",
  "img-src 'self' data: dsh-app:",
  "font-src 'self' data: dsh-app:",
  "media-src 'self' blob: dsh-app:",
  "connect-src 'self' dsh-app: http://127.0.0.1:* ws://127.0.0.1:* blob:",
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
