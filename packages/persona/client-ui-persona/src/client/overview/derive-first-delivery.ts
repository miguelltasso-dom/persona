import type { KanbanCardModel } from '../kanban/types.ts'
import type { FirstDelivery } from './OverviewView.tsx'

/** PRO-4 peak-end: first card in `done` drives the milestone (host tasks via live refresh). */
export function deriveFirstDeliveryMilestone(
  cards: readonly KanbanCardModel[],
): FirstDelivery | undefined {
  const done = cards.filter(card => card.column === 'done')
  if (done.length === 0) return undefined
  const card = done[0]!
  return {
    taskId: card.id,
    title: card.title,
    personaName: card.assignee?.name ?? 'Equipe',
    ...(card.assignee === undefined ? {} : { characterId: card.assignee.id }),
  }
}

/** A entrega como o host registrou (`first_delivery`): quem entregou, mesmo quando o cartão do quadro não tem responsável. */
export function firstDeliveryFromHost(
  host: { readonly status: string; readonly ticketId: string; readonly title: string; readonly personaName: string } | null | undefined,
  members: readonly { readonly id: string; readonly name: string }[],
): FirstDelivery | undefined {
  if (host === null || host === undefined || host.status !== 'ready' || host.personaName === '') return undefined
  const characterId = members.find(member => member.name === host.personaName)?.id
  return {
    taskId: host.ticketId,
    title: host.title,
    personaName: host.personaName,
    ...(characterId === undefined ? {} : { characterId }),
  }
}

/**
 * Marco a mostrar: o do quadro quando ele sabe quem entregou; senão o do host (retrato + nome da persona).
 * "Equipe" genérica só sobra quando nenhum dos dois sabe.
 */
export function pickFirstDelivery(kanban: FirstDelivery | undefined, host: FirstDelivery | undefined): FirstDelivery | undefined {
  if (kanban !== undefined && kanban.characterId !== undefined) return kanban
  if (host !== undefined) return kanban === undefined ? host : { ...kanban, personaName: host.personaName, ...(host.characterId === undefined ? {} : { characterId: host.characterId }) }
  return kanban
}
