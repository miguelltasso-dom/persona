/**
 * Host text that carries an internal id. The proactivity engine names a persona's daily routine after its id
 * (`initiative:<personaId>`), and the health sentences repeat that name; a person must read "Iniciativa de Mídia", never
 * `initiative:m-dia`. Only DISPLAY text goes through this — ids used to call the host (fix targets, row ids) stay as sent.
 */

import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'

export interface NamedPersona {
  readonly id: string
  readonly name: string
}

const INITIATIVE_TOKEN = /initiative:([A-Za-z0-9._-]+)/gu

function sameId(hostId: string, personaId: string): boolean {
  return hostId === personaId || hostId === `p-${personaId}` || personaId === `p-${hostId}`
}

/** "Iniciativa de Mídia" for the persona the id names; a neutral label when the persona is not in the team. */
export function initiativeLabel(dict: LocaleDict, id: string, team: readonly NamedPersona[] | undefined): string {
  const persona = team?.find(row => sameId(id, row.id))
  return persona === undefined
    ? bindLocale(dict, 'routine.initiativeFallback')
    : bindLocale(dict, 'routine.initiativeOf', { name: persona.name })
}

/** Replaces every `initiative:<id>` in a display sentence. Text without internal ids comes back untouched. */
export function humanizeInternalIds(text: string, dict: LocaleDict, team: readonly NamedPersona[] | undefined): string {
  if (!text.includes('initiative:')) return text
  return text.replace(INITIATIVE_TOKEN, (_whole, id: string) => initiativeLabel(dict, id, team))
}
