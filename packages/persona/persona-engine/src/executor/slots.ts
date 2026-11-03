/**
 * Concurrency slots for worker launches and wakes. One extra slot is reserved
 * for a person's message so follow-ups never wait behind new launches.
 */

import { Later } from '../effects.ts'

export type SlotKind = 'launch' | 'wake' | 'person'

/**
 * Tracks active and starting worker sessions against a configured limit.
 */
export class WorkerSlots {
  private readonly starting = new Map<string, SlotKind>()

  /**
   * @param running - Ticket ids whose worker currently holds a slot.
   * @param max - Configured maximum concurrent worker slots.
   */
  constructor(private readonly running: () => string[], private readonly max: () => number) {}

  /** Slots in use across running workers and starting reservations. */
  used(): number {
    return new Set([...this.running(), ...this.starting.keys()]).size
  }

  /** How many launches may start now (wakes keep their reservations). */
  launches(): number {
    const wakes = [...this.starting].flatMap(([ticketId, by]) => by !== 'launch' ? [ticketId] : [])
    return this.max() - new Set([...this.running(), ...wakes]).size
  }

  /**
   * Reserve a startup slot. Idempotent if `ticketId` already holds one.
   * A person's wake (`by === 'person'`) may use one extra slot beyond `max()`.
   * @param ticketId - Ticket that will occupy the slot.
   * @param by - Why the slot is taken.
   */
  reserve(ticketId: string, by: SlotKind): void {
    if (this.starting.has(ticketId)) return
    if (this.used() >= this.max() + (by === 'person' ? 1 : 0)) throw new Later('No worker slot is free')
    this.starting.set(ticketId, by)
  }

  /**
   * Release the starting reservation once the worker is running or the attempt ended.
   * @param ticketId - Ticket whose reservation to drop.
   */
  free(ticketId: string): void {
    this.starting.delete(ticketId)
  }
}
