/**
 * SQLite outbox for one project (P4b). Pending ordered by ticket then conversation.
 */

import type { OutboundMessage, Outbox, ReplyStatus } from '@deepseek-ai/dsh-persona-engine'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** One delivery attempt recorded on a pass. */
export interface OutboxPass {
  readonly id: string
  readonly status: ReplyStatus
  readonly at: string
}

/**
 * Durable outbox. `send` is idempotent (first body wins). `pending` is
 * `ticket_id`, then `conversation` (`source:thread`), then `rowid`.
 */
export class SqliteOutbox implements Outbox {
  readonly store: PersonaStore
  readonly projectId: string
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 2).
   * @param projectId - Tenant.
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, projectId: string, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.projectId = projectId
    this.now = now
  }

  send(message: OutboundMessage): void {
    const existing = this.status(message.id)
    if (existing !== undefined) return
    const conversation = `${message.channel.source}:${message.channel.thread}`
    const ticketId = message.ticketId ?? ''
    const body = JSON.stringify({
      ...message,
      channel: { ...message.channel, address: { ...message.channel.address } },
    })
    this.store.tx((db) => {
      run(db, 'INSERT INTO engine_outbox (project_id, id, ticket_id, conversation, status, body) VALUES (?, ?, ?, ?, \'pending\', ?)', [
        this.projectId, message.id, ticketId, conversation, body,
      ])
    })
  }

  status(id: string): ReplyStatus | undefined {
    const row = this.store.db.prepare(
      'SELECT status FROM engine_outbox WHERE project_id = ? AND id = ?',
    ).get(this.projectId, id)
    return row === undefined ? undefined : asStatus(text(row, 'status'))
  }

  withdraw(id: string): void {
    if (this.status(id) !== 'pending') return
    this.store.tx((db) => {
      run(db, 'DELETE FROM engine_outbox WHERE project_id = ? AND id = ? AND status = \'pending\'', [this.projectId, id])
    })
  }

  /**
   * Pending messages, ticket then conversation then insert order.
   * @returns Cloned messages still waiting.
   */
  pending(): OutboundMessage[] {
    const rows = this.store.db.prepare(
      "SELECT body FROM engine_outbox WHERE project_id = ? AND status = 'pending' ORDER BY ticket_id ASC, conversation ASC, rowid ASC",
    ).all(this.projectId)
    return rows.map(row => structuredClone(JSON.parse(text(row, 'body')) as OutboundMessage))
  }

  /**
   * Mark pending messages sent or dropped. Idempotent per id.
   * @param outcome - Terminal status.
   * @param ids - Optional subset; default is every pending message.
   * @returns Newly recorded passes.
   */
  pass(outcome: Exclude<ReplyStatus, 'pending'>, ids?: readonly string[]): OutboxPass[] {
    const targets = ids ?? this.pending().map(message => message.id)
    const at = this.now()
    const recorded: OutboxPass[] = []
    this.store.tx((db) => {
      for (const id of targets) {
        const row = db.prepare(
          "SELECT status FROM engine_outbox WHERE project_id = ? AND id = ? AND status = 'pending'",
        ).get(this.projectId, id)
        if (row === undefined) continue
        run(db, 'UPDATE engine_outbox SET status = ? WHERE project_id = ? AND id = ?', [outcome, this.projectId, id])
        const seqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS lastSeq FROM engine_outbox_pass WHERE project_id = ?').get(this.projectId)
        const seq = integer(seqRow ?? { lastSeq: 0 }, 'lastSeq') + 1
        run(db, 'INSERT INTO engine_outbox_pass (project_id, seq, id, status, at) VALUES (?, ?, ?, ?, ?)', [
          this.projectId, seq, id, outcome, at,
        ])
        recorded.push({ id, status: outcome, at })
      }
    })
    return recorded
  }

  /**
   * Settle one pending id (alias of {@link SqliteOutbox.pass} for a single id).
   * @param id - Message id.
   * @param outcome - Terminal status.
   * @returns The pass, or `undefined` when the id was not pending.
   */
  settle(id: string, outcome: Exclude<ReplyStatus, 'pending'>): OutboxPass | undefined {
    return this.pass(outcome, [id])[0]
  }

  /**
   * @returns Recorded passes in seq order.
   */
  history(): readonly OutboxPass[] {
    const rows = this.store.db.prepare(
      'SELECT id, status, at FROM engine_outbox_pass WHERE project_id = ? ORDER BY seq ASC',
    ).all(this.projectId)
    return rows.map((row): OutboxPass => ({
      id: text(row, 'id'),
      status: asStatus(text(row, 'status')),
      at: text(row, 'at'),
    }))
  }
}

function asStatus(value: string): ReplyStatus {
  if (value === 'pending' || value === 'sent' || value === 'dropped') return value
  throw new Error(`unknown outbox status ${value}`)
}
