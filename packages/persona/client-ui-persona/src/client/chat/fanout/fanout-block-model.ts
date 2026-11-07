/**
 * CV-8: gathers the lines of a "Respostas da equipe" block out of the message stream. The host posts ONE message per persona
 * (`coord-<msg>-fan-<persona>`), all sharing `fanout.id`; the thread draws them as ONE card at the place of the first line.
 */

import type { ChannelMessageUi } from '../../remote/map-host-ui.ts'

export interface FanoutBlockModel {
  readonly id: string
  /** Index (in the message list) of the first line: where the card is drawn. The other lines draw nothing of their own. */
  readonly firstIndex: number
  /** One line per persona, in the host's order (`fanout.index`). */
  readonly lines: readonly ChannelMessageUi[]
  readonly total: number
}

/**
 * @param messages - The thread, in order.
 * @returns The blocks by `fanout.id`; empty when no message carries `fanout` (the usual thread, and a host without `Config.fanout`).
 */
export function buildFanoutBlocks(messages: readonly ChannelMessageUi[]): ReadonlyMap<string, FanoutBlockModel> {
  const blocks = new Map<string, { firstIndex: number; byPersona: Map<string, ChannelMessageUi>; total: number }>()
  messages.forEach((message, index) => {
    const line = message.fanout
    if (line === undefined) return
    const block = blocks.get(line.id) ?? { firstIndex: index, byPersona: new Map<string, ChannelMessageUi>(), total: line.total }
    // The host re-sends a growing line under the same id: the latest copy of a persona's line wins.
    block.byPersona.set(line.personaId, message)
    block.total = Math.max(block.total, line.total)
    blocks.set(line.id, block)
  })
  const result = new Map<string, FanoutBlockModel>()
  for (const [id, block] of blocks) {
    const lines = [...block.byPersona.values()].sort((a, b) => (a.fanout?.index ?? 0) - (b.fanout?.index ?? 0))
    result.set(id, { id, firstIndex: block.firstIndex, lines, total: block.total })
  }
  return result
}

/** "14:30" in the person's time zone, from the ISO the host sent; empty when it is not a date. */
export function clockLabel(iso: string | undefined): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
