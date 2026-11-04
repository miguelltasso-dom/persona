import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'

/** WAVE2 consent / studying art: `ensinar-<animal>` when Brush shipped, else pose pensando. */
export function teachIllustrationSrc(personaId: string | null, team: TeamView | null): string {
  const persona = team?.personas.find(row => row.id === personaId)
  const ref = (persona?.avatarRef ?? 'atlas').trim().toLowerCase()
  const ensinarKey = `ensinar-${ref}` as keyof typeof ILLUSTRATIONS
  const ensinarSrc = ILLUSTRATIONS[ensinarKey]
  if (ensinarSrc !== undefined) return ensinarSrc
  const pensandoKey = `${ref}-pensando` as keyof typeof ILLUSTRATIONS
  const pensandoSrc = ILLUSTRATIONS[pensandoKey]
  if (pensandoSrc !== undefined) return pensandoSrc
  return ILLUSTRATIONS['empty-dm'] ?? ''
}
