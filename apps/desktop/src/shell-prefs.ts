/** Always-on shell prefs, separate from the updater settings document. */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface PersonaShellPrefs {
  readonly startWithWindows: boolean
  readonly teamPaused: boolean
}

const DEFAULTS: PersonaShellPrefs = { startWithWindows: false, teamPaused: false }

/**
 * Path of the always-on prefs file.
 * @param userData - Electron userData.
 */
export function personaShellPrefsPath(userData: string): string {
  return join(userData, 'persona-shell.json')
}

/**
 * Read always-on prefs. Missing or invalid files yield defaults (start-with-Windows off).
 * @param userData - Electron userData.
 */
export async function readPersonaShellPrefs(userData: string): Promise<PersonaShellPrefs> {
  try {
    const raw = JSON.parse(await readFile(personaShellPrefsPath(userData), 'utf8')) as Partial<PersonaShellPrefs>
    return {
      startWithWindows: raw.startWithWindows === true,
      teamPaused: raw.teamPaused === true,
    }
  } catch {
    return DEFAULTS
  }
}

/**
 * Persist always-on prefs.
 * @param userData - Electron userData.
 * @param prefs - Values to store.
 */
export async function writePersonaShellPrefs(userData: string, prefs: PersonaShellPrefs): Promise<void> {
  const path = personaShellPrefsPath(userData)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({
    startWithWindows: prefs.startWithWindows === true,
    teamPaused: prefs.teamPaused === true,
  }, null, 2)}\n`, 'utf8')
}
