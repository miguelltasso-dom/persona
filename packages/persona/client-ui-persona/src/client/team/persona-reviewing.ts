import type { KanbanCardModel } from '../kanban/types.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from './persona-work-state.ts'

/**
 * "Revisando" is not a host state: it is read from the board. A persona is reviewing when the task she works on is in the review column,
 * or when she is working while something waits in review and she has a current task. The rail and the stage/"Agora" both use this one rule,
 * so the same persona never reads "Revisando" in one place and "Trabalhando" in another (DESIGN-01-MUSE §0.2).
 *
 * @param ui What the host says she is doing.
 * @param currentTask The title of her current task, when the host gives one.
 * @param cards The board cards (only the review column and the titles matter).
 * @returns `true` when she is reviewing.
 */
export function isPersonaReviewing(
  ui: PersonaWorkUiState,
  currentTask: string | undefined,
  cards: readonly Pick<KanbanCardModel, 'column' | 'title'>[],
): boolean {
  if (currentTask === undefined) return false
  const reviewTitles = new Set(cards.filter(card => card.column === 'in_review').map(card => card.title))
  if (reviewTitles.has(currentTask)) return true
  return ui === 'working' && reviewTitles.size > 0
}

/**
 * Flags the "Agora" rows and the stage members of everyone who is reviewing, so both read the same state as the rail.
 *
 * @param rows The "Agora" rows (they carry the current task).
 * @param members The stage members (they do not carry it, so they are matched by name).
 * @param cards The board cards.
 * @returns The same rows and members, with `reviewing: true` on whoever is reviewing.
 */
export function markReviewing(
  rows: readonly PersonaNowSnapshot[],
  members: readonly ChannelPersonaMember[],
  cards: readonly Pick<KanbanCardModel, 'column' | 'title'>[],
): { readonly rows: readonly PersonaNowSnapshot[]; readonly members: readonly ChannelPersonaMember[] } {
  const names = new Set(rows.filter(row => isPersonaReviewing(row.member.state, row.currentTask, cards)).map(row => row.member.name))
  if (names.size === 0) return { rows, members }
  const flag = (member: ChannelPersonaMember): ChannelPersonaMember => (names.has(member.name) ? { ...member, reviewing: true } : member)
  return { rows: rows.map(row => ({ ...row, member: flag(row.member) })), members: members.map(flag) }
}
