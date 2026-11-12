/**
 * Item 17 (colheita): the host's browser view in the card's rows. The host sends ids (it does not know the screen's
 * names); this maps them to the persona names the card shows and keeps an unknown id visible instead of blank.
 */

import type { BrowserPersonaOption, BrowserProfileRow } from './BrowserProfilesCard.tsx'

/** One profile as the host sends it. */
export interface HostBrowserProfile {
  readonly id: string
  readonly name: string
  readonly holder?: { readonly kind: 'persona' | 'person'; readonly id: string }
  readonly running: boolean
  /** Persona ids allowed to drive it. */
  readonly personas: readonly string[]
  /** Persona ids that use it when they do not name one. */
  readonly defaultsFor: readonly string[]
}

/** The host's answer to `browserView`. */
export interface HostBrowserView {
  readonly profiles: readonly HostBrowserProfile[]
  /** Absent = Chrome is not installed on this machine. */
  readonly chrome?: { readonly path: string; readonly version?: string }
  /** Persona ids whose engine cannot carry the browser (Cursor). */
  readonly withoutBrowser?: readonly string[]
}

/**
 * Map the host view to the card's rows.
 * @param view - The host's answer.
 * @param personas - The project's personas (id + name).
 * @returns The rows, in the host's order.
 */
export function browserRows(view: HostBrowserView, personas: readonly BrowserPersonaOption[]): readonly BrowserProfileRow[] {
  const nameOf = (id: string): string => personas.find(persona => persona.id === id)?.name ?? id
  return view.profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    ...(profile.holder === undefined
      ? {}
      : { holder: { kind: profile.holder.kind, name: profile.holder.kind === 'person' ? '' : nameOf(profile.holder.id) } }),
    running: profile.running,
    personas: profile.personas.map(id => ({ id, name: nameOf(id), canBrowse: !(view.withoutBrowser ?? []).includes(id) })),
    defaultFor: profile.defaultsFor.map(nameOf),
  }))
}
