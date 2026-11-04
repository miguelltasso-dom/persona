/** Synthetic channel stream for perf/gallery (never default production). */

import type { ChannelMessageUi } from '../remote/map-host-ui.ts'

export type ChannelMessageScaleSeed = 500 | 10_000

export function mockLargeChannelMessages(count: ChannelMessageScaleSeed): readonly ChannelMessageUi[] {
  return Array.from({ length: count }, (_, index): ChannelMessageUi => ({
    id: `msg-scale-${index}`,
    authorId: index % 4 === 0 ? 'user' : 'atlas',
    authorName: index % 4 === 0 ? 'Miguel' : 'Atlas',
    body: `Mensagem de escala ${index + 1} — texto curto para medir render.`,
    timeLabel: '09:00',
    reactions: [],
  }))
}
