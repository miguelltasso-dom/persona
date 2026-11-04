/** Resolve bundled THIRD_PARTY_NOTICES.txt for desktop About / Configurações › Sobre. */

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Path to THIRD_PARTY_NOTICES.txt when present (packaged resources or dev tree).
 * @param resourcesPath - `process.resourcesPath` from Electron.
 * @param importMetaUrl - Main module `import.meta.url` for dev fallback.
 */
export async function resolveThirdPartyNoticesPath(
  resourcesPath: string,
  importMetaUrl: string,
): Promise<string | undefined> {
  const candidates = [
    join(resourcesPath, 'THIRD_PARTY_NOTICES.txt'),
    fileURLToPath(new URL('../resources/THIRD_PARTY_NOTICES.txt', importMetaUrl)),
  ]
  for (const path of candidates) {
    try {
      await access(path)
      return path
    } catch (error) {
      void error
    }
  }
  return undefined
}

/**
 * About-box legal block: bundled notices when present.
 * @param notices - File body, if resolved.
 */
export function aboutLegalText(notices: string | undefined): string {
  return notices?.trim() ?? ''
}

/**
 * Fallback About legal line when the notices file is missing.
 * @returns Empty string; the About box already has version and credits.
 */
export function formatDesktopLegalNotices(): string {
  return ''
}
