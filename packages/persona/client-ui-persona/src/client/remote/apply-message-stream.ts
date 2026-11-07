import type { ChannelMessageUi } from './map-host-ui.ts'
import { mapMessage, mapSortedMessageStream } from './map-host-ui.ts'
import type { MessageView, TeamView } from './persona-remote-types.ts'

export interface MessageStreamFrame {
  readonly kind: 'baseline' | 'upsert'
  readonly events: readonly MessageView[]
  readonly order: readonly string[]
}

/**
 * Apply a host {@link MessageStreamFrame} onto the current channel message list.
 * @param current - Messages already shown.
 * @param frame - Baseline or upsert from `followMessages`.
 * @param team - Team for author labels.
 * @param memberId - Viewer member id.
 */
export function applyMessageStreamFrame(
  current: readonly ChannelMessageUi[],
  frame: MessageStreamFrame,
  team: TeamView,
  memberId: string,
  taskTitleById: ReadonlyMap<string, string> = new Map(),
): readonly ChannelMessageUi[] {
  if (frame.kind === 'baseline') {
    return mapSortedMessageStream(frame.events, team, memberId, taskTitleById)
  }
  const incoming = frame.events.map(event => mapMessage(event, team, memberId, taskTitleById))
  // O eco do host de uma mensagem que a PRÓPRIA pessoa acabou de escrever é a mesma mensagem da linha otimista (`local-…` / `local-dm-…`):
  // a otimista sai (uma por eco), senão o fio mostra o texto 2× até o próximo refresh (P0 duplicata no #geral). Texto igual, mesma autora.
  let base = current
  for (const row of incoming) {
    if (row.authorId !== 'user' || base.some(known => known.id === row.id)) continue
    const index = base.findIndex(known => known.id.startsWith('local-') && known.authorId === 'user' && known.body === row.body)
    if (index >= 0) base = base.filter((_, position) => position !== index)
  }
  const byId = new Map(base.map(row => [row.id, row]))
  for (const row of incoming) byId.set(row.id, row)
  const order = [...base.map(row => row.id)]
  for (const id of frame.order) {
    if (!order.includes(id)) order.push(id)
  }
  return order.map(id => byId.get(id)).filter((row): row is ChannelMessageUi => row !== undefined)
}
