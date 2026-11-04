/** Rivet preload: native directory picker on Electron (`personaDesktop.pickDirectory`). */

export interface PersonaDesktopBridge {
  pickDirectory(request?: { readonly title?: string }): Promise<string | null>
}

export function personaDesktopBridge(): PersonaDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = (window as Window & { personaDesktop?: PersonaDesktopBridge }).personaDesktop
  return bridge
}

/** BYC vault folder — native picker when packaged, prompt fallback on web dev. */
export async function pickVaultFolderPath(title: string): Promise<string | null> {
  const bridge = personaDesktopBridge()
  if (bridge !== undefined) {
    return bridge.pickDirectory({ title })
  }
  if (typeof window === 'undefined') return null
  const path = window.prompt(title)
  if (path === null) return null
  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}
