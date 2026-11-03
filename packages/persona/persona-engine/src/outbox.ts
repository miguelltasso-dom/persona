/**
 * In-memory Outbox and delivery passes. The Engine queues inside a transaction;
 * a sender delivers after commit.
 */

import type { OutboundMessage, Outbox, ReplyStatus } from './core/ports.ts'

/** One delivery attempt recorded on a pass through the outbox. */
export interface OutboxPass {
  id: string
  status: ReplyStatus
  at: string
}

/**
 * Durable-enough outbox for tests and ephemeral hosts. SQLite outbox is Anvil's.
 */
export class MemoryOutbox implements Outbox {
  private readonly messages = new Map<string, OutboundMessage>()
  private readonly statuses = new Map<string, ReplyStatus>()
  private readonly passes: OutboxPass[] = []

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  send(message: OutboundMessage): void {
    if (this.messages.has(message.id)) return
    this.messages.set(message.id, { ...message, channel: { ...message.channel, address: { ...message.channel.address } } })
    this.statuses.set(message.id, 'pending')
  }

  status(id: string): ReplyStatus | undefined {
    return this.statuses.get(id)
  }

  withdraw(id: string): void {
    if (this.statuses.get(id) !== 'pending') return
    this.messages.delete(id)
    this.statuses.delete(id)
  }

  /** First queued message that is still pending, oldest first. */
  pending(): OutboundMessage[] {
    return [...this.messages.values()].filter(message => this.statuses.get(message.id) === 'pending')
  }

  /**
   * One pass: mark pending messages sent or dropped. Idempotent per id.
   * @param outcome - Terminal status applied to each pending id (or a subset).
   * @param ids - Optional subset; default is every pending message.
   */
  pass(outcome: Exclude<ReplyStatus, 'pending'>, ids?: readonly string[]): OutboxPass[] {
    const targets = ids ?? this.pending().map(message => message.id)
    const at = this.now()
    const recorded: OutboxPass[] = []
    for (const id of targets) {
      if (this.statuses.get(id) !== 'pending') continue
      this.statuses.set(id, outcome)
      const row = { id, status: outcome, at }
      this.passes.push(row)
      recorded.push(row)
    }
    return recorded
  }

  history(): readonly OutboxPass[] {
    return this.passes
  }
}
