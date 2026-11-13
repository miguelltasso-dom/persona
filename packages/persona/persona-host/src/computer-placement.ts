/**
 * D-117 (host): the ONE placement rule is Zinc's `validatePersonaComputerConfig` (persona-engine `computer-scope.ts`). This file only binds it to the shape the host's books use (`PlacementValidator`):
 * it maps the fields and fails CLOSED when the kind of the computer is unknown. It decides nothing itself: there is no second copy of the matrix.
 */

import { decideComputerUse, validatePersonaComputerConfig, type ComputerScopeDecision } from '@deepseek-ai/dsh-persona-engine'
import type { Audience, HomeFacts, PlacementValidator } from './persona-scope.ts'

/** What `computerAccessOf` gathers from the host for ONE call (read again every time, never kept). */
export interface AccessFacts {
  readonly persona: { readonly id: string; readonly audience: Audience; readonly creatorId: string; readonly homeComputerId: string; readonly computerUse: boolean }
  /** THIS computer (where the executor runs), as the host knows it; undefined = unknown. */
  readonly here: HomeFacts | undefined
  readonly commanderId: string
  /** Who may command her besides the owner of this computer ("Quem pode usar"). */
  readonly users: readonly string[]
}

/**
 * "May this person make this persona use THIS computer now?" — Zinc's matrix (`decideComputerUse`) and nothing else. This only assembles its input; a computer whose kind nobody told the host is `unreadable`, and the
 * owner of the computer is always among who may command a team persona on it (the list adds people, never removes the owner).
 * @param facts - What the host gathered.
 */
export function accessOf(facts: AccessFacts): ComputerScopeDecision {
  const { here } = facts
  if (here?.kind === undefined) return { allow: false, reason: 'unreadable' }
  const ownerId = here.ownerId ?? ''
  return decideComputerUse({
    persona: facts.persona,
    computer: { computerId: here.computerId, kind: here.kind, ownerId, teamComputerUse: here.teamComputerUse === true },
    commanderId: facts.commanderId,
    allowedIds: ownerId === '' ? [...facts.users] : [ownerId, ...facts.users],
  })
}

/** The engine's validator, in the shape of the host's books. An unknown kind of computer (nobody told the host what it is) is `invalid`, never "ok". */
export const validatePlacement: PlacementValidator = ({ persona, home }) => {
  if (home.kind === undefined) return { ok: false, reason: 'invalid' }
  return validatePersonaComputerConfig({
    persona: { id: persona.id, audience: persona.audience, creatorId: persona.creatorId, homeComputerId: persona.homeComputerId, computerUse: persona.computerUse },
    home: { computerId: home.computerId, kind: home.kind, ownerId: home.ownerId, teamComputerUse: home.teamComputerUse },
  })
}
