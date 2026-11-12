import { personaStateOf, type PersonaStateName } from '../team/persona-state.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'

/**
 * The vocabulary name (DESIGN-01-MUSE §0.2) of one "Agora" row, read by the same function as the rail, the stage and the DM header:
 * the activity, the draft count, "Revisando" (the board says so), the silence window ("Descansando") and the deliberate pause ("Pausada").
 * Only a persona who is none of those reads "Disponível".
 *
 * @param row One persona of the "Agora" strip.
 * @returns The state every surface draws for her.
 */
export function nowRowState(row: PersonaNowSnapshot): PersonaStateName {
  return personaStateOf(row.member)
}

export interface NowGroups {
  /** Everyone with something to say: working, reviewing, in a draft, waiting on the person, stuck, paused on purpose. Keeps the host order. */
  readonly cards: readonly PersonaNowSnapshot[]
  /** The "Disponível" personas, shown as one line of faces. Keeps the host order. */
  readonly available: readonly PersonaNowSnapshot[]
  /** The "Descansando" personas (silence window or team paused): their own calm line, so a quiet night is not five identical cards. */
  readonly resting: readonly PersonaNowSnapshot[]
}

/**
 * Splits the "Agora" rows: a card per persona that has something to say, one line for the ones who are simply ready and one for the
 * ones who are resting. Nobody disappears: every other state keeps its card with its own words.
 *
 * @param rows The host rows, in host order.
 * @returns The card, available and resting rows.
 */
export function groupNowRows(rows: readonly PersonaNowSnapshot[]): NowGroups {
  const cards: PersonaNowSnapshot[] = []
  const available: PersonaNowSnapshot[] = []
  const resting: PersonaNowSnapshot[] = []
  for (const row of rows) {
    const state = nowRowState(row)
    if (state === 'available') available.push(row)
    else if (state === 'resting') resting.push(row)
    else cards.push(row)
  }
  return { cards, available, resting }
}

/**
 * The persona that holds the Coordenação function (the one the person asks), or undefined when nobody does.
 *
 * @param rows The host rows.
 * @returns The first row flagged as coordination.
 */
export function coordinationOf(rows: readonly PersonaNowSnapshot[]): PersonaNowSnapshot | undefined {
  return rows.find(row => row.member.systemRoles?.includes('coordination') === true)
}
