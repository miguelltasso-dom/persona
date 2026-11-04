/** Default DSH profile the Persona desktop host boots. */
export const PERSONA_HOST_PROFILE = 'persona'

const PERSONA_APP = '@deepseek-ai/dsh-persona-app'

/** One loaded bundle layer (name only). */
export interface PersonaHostLayer {
  readonly packageName: string
}

/** A bundle the loader skipped, with why. */
export interface PersonaHostSkipped {
  readonly packageName: string
  readonly reason: string
}

/**
 * Profile name the Host passes to `runProfile`. Default `persona`, never `web`.
 * @param env - Process environment.
 */
export function resolveDesktopHostProfileName(env: NodeJS.ProcessEnv = process.env): string {
  const named = env.DSH_PROFILE?.trim()
  return named !== undefined && named.length > 0 ? named : PERSONA_HOST_PROFILE
}

/**
 * Refuse to boot a DSH-only composition: missing persona-app means the default web client.
 * @param profile - Loaded profile layers.
 * @param profileName - Name passed to `runProfile`.
 */
export function assertPersonaAppLayer(
  profile: { readonly layers: readonly PersonaHostLayer[]; readonly skippedBundles: readonly PersonaHostSkipped[] },
  profileName: string,
): void {
  if (profile.layers.some(layer => layer.packageName === PERSONA_APP)) return
  const skipped = profile.skippedBundles
    .filter(row => row.packageName === PERSONA_APP)
    .map(row => row.reason)
  throw new Error(
    `desktop host: persona-app is not in the ${profileName} profile`
    + `${skipped.length > 0 ? ` (${skipped.join('; ')})` : ''}; the Persona shell will not mount`,
  )
}
