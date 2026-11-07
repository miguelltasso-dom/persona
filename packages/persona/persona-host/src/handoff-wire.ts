/**
 * The thread line of a request one persona made to a colleague (EQUIPE-REAL, contracts/team-real.md) lives in the message body: a
 * plain sentence first (a client that does not know the card still reads it), the marker last — `[[handoff:{json}]]`, like
 * `[[persona-ask:…]]` and `[[task-proposal:…]]`. The words of the UI are the UI's; the host sends the data. The bilhete is NOT here:
 * it stays in the Task (`listHandoffs`), never in the channel.
 */

import type { HandoffCardView } from './types.ts'

const MARKER = /\[\[handoff:([\s\S]+?)\]\]\s*$/u
const STATUSES = ['asked', 'delivered', 'resumed', 'held', 'blocked'] as const

/**
 * @param card - The card.
 * @param sentence - The plain sentence shown before the marker.
 * @returns The body to store.
 */
export function handoffBody(card: HandoffCardView, sentence: string): string {
  return `${sentence}\n[[handoff:${JSON.stringify(card)}]]`
}

/**
 * The sentence an old client shows.
 * @param card - The card.
 * @param names - Display names of the two personas.
 */
export function handoffSentence(card: Pick<HandoffCardView, 'status' | 'title' | 'mode' | 'purpose'>, names: { readonly from: string; readonly to: string }): string {
  if (card.purpose === 'review' && card.status === 'asked') return `${names.from} pediu a revisão a ${names.to}: ${card.title}`
  switch (card.status) {
    case 'asked': return card.mode === 'help' ? `${names.from} pediu ajuda a ${names.to}: ${card.title}` : `${names.from} passou para ${names.to}: ${card.title}`
    // A HELP is not a hand-over: the colleague helped, and the asker goes on ("Caio ajudou Teo"). Only a passage (`next`) is "entregou para".
    case 'delivered': return card.mode === 'help' ? `${names.to} ajudou ${names.from}: ${card.title}` : `${names.to} entregou para ${names.from}: ${card.title}`
    case 'resumed': return `${names.from} retomou “${card.title}” com a entrega de ${names.to}`
    case 'held': return `${names.from} pediu a ${names.to}, que está em pausa: ${card.title}`
    case 'blocked': return `${names.from} pediu a ${names.to}, mas não deu para seguir: ${card.title}`
  }
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * @param body - Stored message body.
 * @returns The card when the marker is valid, else undefined.
 */
export function handoffFromBody(body: string): HandoffCardView | undefined {
  const raw = MARKER.exec(body)?.[1]?.trim()
  if (raw === undefined || raw === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  const fromPersonaId = text(row, 'fromPersonaId')
  const toPersonaId = text(row, 'toPersonaId')
  // The colleague's Task does not exist yet when the line is first written (the engine may still be waiting): `taskId` can be empty.
  const taskId = typeof row.taskId === 'string' ? row.taskId : undefined
  const fromTaskId = text(row, 'fromTaskId')
  const title = text(row, 'title')
  const status = STATUSES.find(item => item === row.status)
  const mode = row.mode === 'help' || row.mode === 'handoff' ? row.mode : undefined
  if (fromPersonaId === undefined || toPersonaId === undefined || taskId === undefined || fromTaskId === undefined || title === undefined || status === undefined || mode === undefined) return undefined
  const reason = text(row, 'reason')
  const connector = text(row, 'connector')
  return {
    fromPersonaId, toPersonaId, taskId, fromTaskId, title, mode, status,
    ...(reason === undefined ? {} : { reason }),
    ...(connector === undefined ? {} : { connector }),
    ...(row.purpose === 'review' ? { purpose: 'review' as const } : {}),
  }
}
