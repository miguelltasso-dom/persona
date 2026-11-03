/** Persona product identity for the Electron shell (A3b / D-016 / D-017). */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

/** Window, About panel, and protocol display name. */
export const PERSONA_PRODUCT_NAME = 'Persona'

/** Custom OS protocol; `dsh://` remains accepted so older links still focus the window. */
export const PERSONA_PROTOCOL = 'persona'

/** Runtime application id (packaging exe/appId rename is D8). */
export const PERSONA_APP_ID = 'com.persona.app'

/** Default product data directory name under the OS home (passed to the host as DSH_HOME). */
export const PERSONA_HOME_DIR_NAME = '.persona'

/** First-run surface after DeepSeek Welcome is removed. */
export type PersonaStartupSurface = 'workspace' | 'deepseek-welcome'

/**
 * Replace DeepSeek Welcome with the Persona workspace (C8 onboarding lives there).
 * Opt-in `DSH_DESKTOP_WELCOME=1` keeps the upstream Welcome for its own specs.
 */
export function resolvePersonaStartupSurface(): PersonaStartupSurface {
  return shouldShowDeepSeekWelcome() ? 'deepseek-welcome' : 'workspace'
}

/**
 * Whether the native DeepSeek Welcome window may open.
 * Production default is off; Welcome tests set `DSH_DESKTOP_WELCOME=1`.
 */
export function shouldShowDeepSeekWelcome(): boolean {
  return process.env.DSH_DESKTOP_WELCOME === '1'
}

/**
 * Whether updater / publication / mandatory-policy network checks may run.
 * Production default is off; packaging qualification can set `DSH_DESKTOP_UPDATES=1`.
 */
export function personaUpdatesEnabled(): boolean {
  return process.env.DSH_DESKTOP_UPDATES === '1'
}

/**
 * Resolve the Persona data home and publish it as `DSH_HOME` for the host.
 * Precedence: existing `DSH_HOME`, then `PERSONA_HOME`, then `~/.persona`.
 */
export function resolvePersonaProcessHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromDsh = env.DSH_HOME?.trim()
  if (fromDsh !== undefined && fromDsh.length > 0) return fromDsh
  const fromPersona = env.PERSONA_HOME?.trim()
  if (fromPersona !== undefined && fromPersona.length > 0) return fromPersona
  return join(homedir(), PERSONA_HOME_DIR_NAME)
}

/**
 * Apply Persona identity before any `app.getPath('userData')` read.
 * Missing Electron setters (unit-test mocks) are ignored.
 */
export function applyPersonaDesktopIdentity(): void {
  const home = resolvePersonaProcessHome()
  process.env.PERSONA_HOME ??= home
  process.env.DSH_HOME ??= home
  process.env.DSH_CLIENT_TITLE ??= PERSONA_PRODUCT_NAME
  process.env.DSH_TELEMETRY_DISABLED ??= '1'
  process.env.DSH_TELEMETRY_MODE ??= 'DISABLED'
  try {
    app.setName(PERSONA_PRODUCT_NAME)
  } catch {
    // Test doubles omit setName.
  }
  try {
    app.setAppUserModelId(PERSONA_APP_ID)
  } catch {
    // Test doubles omit setAppUserModelId.
  }
  const userData = process.env.DSH_DESKTOP_USER_DATA_DIR
  if (userData !== undefined && userData.length > 0) {
    try {
      app.setPath('userData', userData)
    } catch {
      // Test doubles omit setPath.
    }
    return
  }
  try {
    app.setPath('userData', join(homedir(), process.platform === 'win32' ? 'AppData/Roaming/Persona' : '.persona-electron'))
  } catch {
    // Test doubles omit setPath.
  }
}
