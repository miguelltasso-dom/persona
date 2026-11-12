import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { TwoDayRowView } from './governance-contract.ts'
import type { TwoDayFace } from './TeamHealthView.tsx'
import { twoDayRowPersonaId } from './two-day-persona.ts'

const bare = (id: string): string => id.replace(/^p-/u, '').toLowerCase()

/**
 * The face of the persona a row of the 2-day test belongs to, read from the live team. The row names the persona by the routine id
 * (`initiative:<id>`, with or without the `p-` prefix) or by the character id the live "Agora" strip uses (`live-now-<character>`).
 * A persona is never a letter: the portrait she was hired with, or the stable gallery animal.
 *
 * @param row The row of the 2-day test.
 * @param live The live team and the "Agora" strip.
 * @returns The face, or undefined when the row is not a persona's (or the team does not have her).
 */
export function twoDayRowFace(row: TwoDayRowView, live: Pick<PersonaLiveSnapshot, 'team' | 'nowRows'>): TwoDayFace | undefined {
  const rowPersona = twoDayRowPersonaId(row.id)
  if (rowPersona === undefined || live.team === null) return undefined
  const key = bare(rowPersona)
  const byId = live.team.personas.find(persona => bare(persona.id) === key || bare(persona.avatarRef) === key)
  const nowName = byId === undefined ? live.nowRows.find(now => bare(now.member.id) === key)?.member.name : undefined
  const found = byId ?? (nowName === undefined ? undefined : live.team.personas.find(persona => persona.name === nowName))
  if (found === undefined) return undefined
  const src = resolvePersonaFace({ id: found.id, characterId: found.avatarRef, name: found.name })
  return { name: found.name, src }
}
