/**
 * Item 17 (colheita): named browser profiles on this computer. A profile is one Chrome folder with its own logins,
 * shared by the personas that were granted it; the person's own Chrome profile is never used or read.
 *
 * Pure: the caller stores the list and the grants. One profile per id, one name per computer (case-insensitive), one
 * folder under the product's data directory.
 */

import { join } from 'node:path'

/** A named profile on this computer. */
export interface BrowserProfile {
  /** Stable id (`p-<random>`), used for the folder and the turn. */
  readonly id: string
  /** The name the person sees ("Loja", "WhatsApp da loja"); unique, case-insensitive. */
  readonly name: string
}

/** Who may drive a profile: persona id → profile ids it was granted. */
export type ProfileGrants = Readonly<Record<string, readonly string[]>>

/** The folder name of the product's profiles inside its data directory. */
export const BROWSER_PROFILES_DIR = 'browser-profiles'

/**
 * The Chrome folder of one profile.
 * @param dataRoot - The product's data directory.
 * @param id - Profile id.
 */
export function profileFolder(dataRoot: string, id: string): string {
  return join(dataRoot, BROWSER_PROFILES_DIR, id)
}

/** The name as it is compared: trimmed, lower case, internal spaces collapsed. */
function comparable(name: string): string {
  return name.trim().replace(/\s+/gu, ' ').toLowerCase()
}

/**
 * Whether another profile already uses this name.
 * @param profiles - Every profile on this computer.
 * @param name - The wanted name.
 * @param exceptId - The profile being renamed, if any.
 */
export function profileNameTaken(profiles: readonly BrowserProfile[], name: string, exceptId?: string): boolean {
  const wanted = comparable(name)
  return profiles.some(profile => profile.id !== exceptId && comparable(profile.name) === wanted)
}

/**
 * A profile by name, for the persona's `browser_profile({ name })` switch.
 * @param profiles - Every profile on this computer.
 * @param name - The name as typed (case and spacing do not matter).
 */
export function profileByName(profiles: readonly BrowserProfile[], name: string): BrowserProfile | undefined {
  const wanted = comparable(name)
  return profiles.find(profile => comparable(profile.name) === wanted)
}

/**
 * Whether a persona was granted this profile. A grant of `*` means every profile, present and future.
 * @param grants - The grants table.
 * @param personaId - The persona.
 * @param profileId - The profile.
 */
export function profileGranted(grants: ProfileGrants, personaId: string, profileId: string): boolean {
  const granted: unknown = grants[personaId]
  if (!Array.isArray(granted)) return false
  return granted.includes('*') || granted.includes(profileId)
}
