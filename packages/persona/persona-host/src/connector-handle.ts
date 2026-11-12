/**
 * The id of an ACCOUNT connector is the proxy URL and the KEY is inside it (CONN-1/CONN-3, Lumen). Only the owner's own screen holds it, to take the connector back; every OTHER thing a person can read
 * — the grant list, the audit, an approval card, the "you gave X the Y" line of the thread — carries a stable HANDLE instead: `account:<12 hex>`. A local connector's id is a name, not a secret, and stays.
 * One file, so the three readers (and the line writer) cannot disagree about what a handle is.
 */

import { createHash } from 'node:crypto'

/**
 * @param id - A connector id as stored.
 * @returns The id itself (a name) or `account:<12 hex>` (it was a URL): stable, so the same connector is always the same handle.
 */
export function connectorHandleOf(id: string): string {
  return /^https?:\/\//iu.test(id) ? `account:${createHash('sha256').update(id).digest('hex').slice(0, 12)}` : id
}

/**
 * @param action - The audit action.
 * @param body - The stored audit body (a JSON string; it keeps the real id).
 * @returns The body with the id of an account connector made safe to read.
 */
export function auditBodyForReader(action: string, body: string): string {
  if (!action.startsWith('connector.')) return body
  return body.replace(/("connectorId":")(https?:\/\/[^"]*)(")/giu, (_all, open: string, url: string, close: string) => `${open}${connectorHandleOf(url)}${close}`)
}

/**
 * The id of the thread line "you gave her permission to use the X": the same grant is the same id (the line is written once), and the connector's real id is never in it.
 * @param personaId - Who got it.
 * @param cli - The CLI.
 * @param connectorId - The connector id as stored.
 * @param grantedAt - When the grant was made.
 */
export function grantLineIdOf(personaId: string, cli: string, connectorId: string, grantedAt: string): string {
  return `connector-grant:${personaId}:${cli}:${connectorHandleOf(connectorId)}:${grantedAt}`
}

/**
 * Lines written BEFORE the handle existed carry the URL in their id: a reader gets the same id with the handle in its place. Any other id is returned as it is.
 * @param id - An event id.
 */
export function eventIdForReader(id: string): string {
  return id.startsWith('connector-grant:') ? id.replace(/https?:\/\/.*?(?=:\d{4}-\d{2}-\d{2}T|$)/u, url => connectorHandleOf(url)) : id
}
