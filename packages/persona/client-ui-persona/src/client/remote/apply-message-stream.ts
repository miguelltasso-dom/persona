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
  const byId = new Map(current.map(row => [row.id, row]))
  for (const event of frame.events) {
    byId.set(event.id, mapMessage(event, team, memberId, taskTitleById))
  }
  const order = [...current.map(row => row.id)]
  for (const id of frame.order) {
    if (!order.includes(id)) order.push(id)
  }
  return order.map(id => byId.get(id)).filter((row): row is ChannelMessageUi => row !== undefined)
}
