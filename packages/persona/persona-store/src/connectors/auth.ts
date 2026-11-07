/**
 * D-084 / HT-8: the authorization of a connector for ONE Task, derived from what the PERSON wrote (never from content the persona read).
 * `request`: the person's own message asked for something that needs the connector. `once`: "Permitir desta vez". It lives and dies
 * with the Task: another Task of the same persona inherits nothing from it. Contract: persona-spec/contracts/connector-grants.md.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Why a connector is authorized for a Task. */
export type TicketAuthSource = 'request' | 'once'

/** One authorization. `messageId` is the person's message that carries the authority. */
export interface TicketConnectorAuth {
  readonly ticketId: string
  readonly cli: string
  readonly connectorId: string
  readonly source: TicketAuthSource
  readonly messageId: string
  readonly at: string
}

/** SQLite book for `ticket_connector_auth` (schema ≥ 22). */
export class TicketConnectorAuthRepos {
  /**
   * @param store - Open store.
   * @param now - Instant factory (tests inject it).
   */
  constructor(readonly store: PersonaStore, private readonly now: () => string = () => new Date().toISOString()) {}

  /**
   * Authorize a connector for a Task. The FIRST authority stays: a later message does not replace it (idempotent).
   * @param input - Task, connector, why, and the person's message.
   * @returns Whether a new row was written.
   * @throws StoreError `constraint` for an empty id or an unknown source.
   */
  put(input: Omit<TicketConnectorAuth, 'at'>): boolean {
    const source: string = input.source // from the wire in some paths: only the two known sources authorize
    if (input.ticketId === '' || input.cli === '' || input.connectorId === '' || input.messageId === '') throw new StoreError('constraint', 'identity')
    if (source !== 'request' && source !== 'once') throw new StoreError('constraint', 'source')
    const changed = this.store.tx(db => db.prepare(
      `INSERT INTO ticket_connector_auth (ticket_id, cli, connector_id, source, message_id, at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticket_id, cli, connector_id) DO NOTHING`,
    ).run(input.ticketId, input.cli, input.connectorId, source, input.messageId, this.now()).changes)
    return Number(changed) > 0
  }

  /**
   * @param ticketId - The Task.
   * @returns Its authorizations, ordered by CLI then connector id (stable).
   */
  list(ticketId: string): TicketConnectorAuth[] {
    return this.store.db.prepare(
      'SELECT ticket_id, cli, connector_id, source, message_id, at FROM ticket_connector_auth WHERE ticket_id = ? ORDER BY cli ASC, connector_id ASC',
    ).all(ticketId).map(readAuth)
  }

  /**
   * Forget a Task's authorizations (the Task ended or was deleted).
   * @param ticketId - The Task.
   */
  drop(ticketId: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM ticket_connector_auth WHERE ticket_id = ?', [ticketId])
    })
  }
}

function readAuth(row: Record<string, SQLOutputValue>): TicketConnectorAuth {
  const source = text(row, 'source')
  return {
    ticketId: text(row, 'ticket_id'),
    cli: text(row, 'cli'),
    connectorId: text(row, 'connector_id'),
    source: source === 'once' ? 'once' : 'request',
    messageId: text(row, 'message_id'),
    at: text(row, 'at'),
  }
}
