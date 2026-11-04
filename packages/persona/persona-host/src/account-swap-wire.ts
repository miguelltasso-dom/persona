/**
 * Typed thread events for the account switch (D-078, ACCOUNT-SWAP-SPEC): `[[account-swap:{json}]]` is the line "A Bia passou
 * para a conta Pessoal…" with its Desfazer; `[[account-ask:{json}]]` is the Notice "Perguntar antes de trocar". Both live in
 * the thread as stored events (a record, not a Toast). The body starts with the plain sentence so a client that does not know
 * the marker still shows something true; the marker is last, like `[[run-error:…]]`.
 */

import type { AccountAskEventView, AccountSwapEventView } from './types.ts'

const SWAP = /\[\[account-swap:([\s\S]+?)\]\]\s*$/u
const ASK = /\[\[account-ask:([\s\S]+?)\]\]\s*$/u

function json(body: string, marker: RegExp): Record<string, unknown> | undefined {
  const raw = marker.exec(body)?.[1]?.trim()
  if (raw === undefined || raw === '') return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' ? value : undefined
}

function account(row: Record<string, unknown>, key: string): { accountId: string; label: string } | undefined {
  const value = row[key]
  if (value === null || typeof value !== 'object') return undefined
  const accountId = text(value as Record<string, unknown>, 'accountId')
  const label = text(value as Record<string, unknown>, 'label')
  return accountId === undefined || label === undefined ? undefined : { accountId, label }
}

/** @param event - The payload. @param sentence - The plain sentence shown before the marker. @returns Body to store. */
export function accountSwapBody(event: AccountSwapEventView, sentence: string): string {
  return `${sentence}\n[[account-swap:${JSON.stringify(event)}]]`
}

/** @param event - The payload. @param sentence - The plain sentence shown before the marker. @returns Body to store. */
export function accountAskBody(event: AccountAskEventView, sentence: string): string {
  return `${sentence}\n[[account-ask:${JSON.stringify(event)}]]`
}

/** @param body - Stored message body. @returns The switch event when the marker is valid. */
export function accountSwapFromBody(body: string): AccountSwapEventView | undefined {
  const row = json(body, SWAP)
  if (row === undefined) return undefined
  const swapId = text(row, 'swapId')
  const personaId = text(row, 'personaId')
  const personaName = text(row, 'personaName')
  const provider = text(row, 'provider')
  const from = account(row, 'from')
  const to = account(row, 'to')
  if (swapId === undefined || personaId === undefined || personaName === undefined || provider === undefined || from === undefined || to === undefined) return undefined
  const until = text(row, 'until')
  return { swapId, personaId, personaName, provider, from, to, ...(until === undefined ? {} : { until }), auto: row.auto === true, undone: row.undone === true }
}

/** @param body - Stored message body. @returns The "Perguntar" Notice when the marker is valid. */
export function accountAskFromBody(body: string): AccountAskEventView | undefined {
  const row = json(body, ASK)
  if (row === undefined) return undefined
  const ticketId = text(row, 'ticketId')
  const personaId = text(row, 'personaId')
  const personaName = text(row, 'personaName')
  const provider = text(row, 'provider')
  const from = account(row, 'from')
  const to = account(row, 'to')
  if (ticketId === undefined || personaId === undefined || personaName === undefined || provider === undefined || from === undefined || to === undefined) return undefined
  const quota = text(row, 'quota') === 'desconhecida' ? 'desconhecida' : 'livre'
  const until = text(row, 'until')
  const resolved = text(row, 'resolved')
  return {
    ticketId, personaId, personaName, provider, from, to, quota,
    ...(until === undefined ? {} : { until }),
    ...(resolved === 'continued' || resolved === 'waiting' ? { resolved } : {}),
  }
}
