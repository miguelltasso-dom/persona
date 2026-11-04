/**
 * The thread card of P1-9 lives in the message body: the plain sentence first (a client that does not know the card still
 * shows something true), the marker last — `[[task-proposal:{json}]]`, like `[[account-ask:…]]` and `[[run-error:…]]`.
 * Only what does not change is in the body; the live state (open / accepted / declined / expired) is `listTaskProposals`.
 */

import type { TaskProposalCardView, TaskProposalItemView } from './types.ts'

const MARKER = /\[\[task-proposal:([\s\S]+?)\]\]\s*$/u

/**
 * @param card - The card.
 * @param sentence - The plain sentence shown before the marker.
 * @returns The body to store.
 */
export function taskProposalBody(card: TaskProposalCardView, sentence: string): string {
  return `${sentence}\n[[task-proposal:${JSON.stringify(card)}]]`
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function itemOf(value: unknown): TaskProposalItemView | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const id = text(row, 'id')
  const personaId = text(row, 'personaId')
  const personaName = text(row, 'personaName')
  const question = text(row, 'question')
  const reason = text(row, 'reason')
  if (id === undefined || personaId === undefined || personaName === undefined || question === undefined || reason === undefined) return undefined
  return { id, personaId, personaName, question, reason }
}

/**
 * @param body - Stored message body.
 * @returns The card when the marker is valid (1–3 well-formed items), else undefined.
 */
export function taskProposalFromBody(body: string): TaskProposalCardView | undefined {
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
  const list = Array.isArray(row.items) ? row.items : []
  const items = list.map(itemOf)
  if (items.length === 0 || items.length > 3 || items.some(item => item === undefined)) return undefined
  const kind = items.length === 1 ? 'single' : 'digest'
  if (row.kind !== kind) return undefined
  return { kind, items: items as TaskProposalItemView[] }
}
