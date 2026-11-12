import { AVATAR_96 } from '../assets/generated-imports.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import type { ActivityItem } from '../primitives/Pooled.tsx'
import type { TeamView } from './persona-remote-types.ts'
import type { TurnContextActivityFoldUi } from './turn-context-ui.ts'

/** Wire fold from host `listTurnActivity` (T3 §9). */
export interface TurnActivityGroupWire {
  readonly personaId: string
  readonly items: readonly {
    readonly id: string
    readonly kind: ActivityItem['kind']
    readonly title: string
    readonly status: ActivityItem['status']
    readonly at?: string
  }[]
  readonly moreCount: number
}

function avatarForPersona(team: TeamView | null, personaId: string): string | undefined {
  if (team === null) return undefined
  const row = team.personas.find(p => p.id === personaId)
  if (row === undefined) return undefined
  const key = normalizeCharacterId(row.avatarRef) ?? normalizeCharacterId(row.name)
  if (key === undefined) return undefined
  return AVATAR_96[key as keyof typeof AVATAR_96]
}

function personaName(team: TeamView | null, personaId: string): string {
  if (team === null) return personaId
  return team.personas.find(p => p.id === personaId)?.name ?? personaId
}

/**
 * @returns Activity folds for the turn-context drawer, one row per persona thread.
 */
export function mapTurnActivityFolds(
  folds: readonly TurnActivityGroupWire[],
  team: TeamView | null,
): readonly TurnContextActivityFoldUi[] {
  return folds
    .filter(fold => fold.items.length > 0 || fold.moreCount > 0)
    .map(fold => ({
      persona: {
        name: personaName(team, fold.personaId),
        avatarSrc: avatarForPersona(team, fold.personaId),
      },
      items: fold.items.map(item => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        status: item.status,
        ...(item.at === undefined ? {} : { at: item.at }),
      })),
      moreCount: fold.moreCount,
    }))
}
