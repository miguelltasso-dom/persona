/** Durable admission waits controlled by the host's cached connection state. */
import { UserError } from './errors.ts'
import { threadKey, type EngineUnavailableReason, type Trigger } from './model.ts'
import { EnginePart, type EngineOptions } from './part.ts'
import type { Intake } from './intake.ts'

/** Messages held for at least one day require a person's renewed authorization before routing. */
export const ENGINE_TRIGGER_CONFIRM_AFTER_MS: number = 24 * 60 * 60 * 1000

/** Only a person's explicit confirmation may release an expired message. */
export interface EngineReadyOptions { confirmed?: boolean }

/** Retains messages without learning which runner or connection the host uses. */
export class Availability extends EnginePart {
  constructor(options: EngineOptions, private readonly intake: Intake) { super(options) }

  /** Record a safe connection failure once; the trigger remains queued. */
  unavailable(triggerId: string, reason: EngineUnavailableReason): boolean {
    const trigger = this.repo.triggers.get(triggerId)
    if (!trigger) throw new UserError('unknownTrigger')
    const disposition = this.repo.triggers.disposition(triggerId)!
    const wait = disposition.engineWait
    if (disposition.filtered || wait?.notified || wait?.state === 'released' || wait?.state === 'dismissed') return false
    this.repo.triggers.saveDisposition(triggerId, { ...disposition,
      engineWait: { state: wait?.state ?? 'pending', since: wait?.since ?? this.now(), reason, notified: true } })
    this.queueForEval(trigger)
    const event = { type: 'no_engine_ready', at: this.now(), data: {
      triggerId, streamId: threadKey(trigger.threads[0]!), reason,
    } } as const
    this.repo.afterCommit(() => this.options.emit?.(event))
    return true
  }

  /** Pending messages in their persisted per-stream arrival order, including waits requiring confirmation. */
  pending(): Trigger[] {
    return this.repo.threads.list().flatMap(thread => thread.pending.flatMap(id => {
      const wait = this.repo.triggers.disposition(id)?.engineWait
      const trigger = this.repo.triggers.get(id)
      return trigger && (wait?.state === 'pending' || wait?.state === 'confirmation_required') ? [trigger] : []
    }))
  }

  /** Release only the head of a stream; the host resumes routing from the returned immutable trigger. */
  ready(triggerId: string, options: EngineReadyOptions): Trigger | undefined {
    const trigger = this.repo.triggers.get(triggerId)
    const disposition = this.repo.triggers.disposition(triggerId)
    const wait = disposition?.engineWait
    if (!trigger || !disposition || !wait || wait.state === 'released' || wait.state === 'dismissed') return undefined
    const streamId = threadKey(trigger.threads[0]!)
    const head = this.pending().find(item => threadKey(item.threads[0]!) === streamId)
    if (head?.id !== triggerId) return undefined
    const expired = Date.parse(this.now()) - Date.parse(wait.since) >= ENGINE_TRIGGER_CONFIRM_AFTER_MS
    if (!options.confirmed && (expired || wait.state === 'confirmation_required')) {
      if (wait.state !== 'confirmation_required') {
        this.repo.triggers.saveDisposition(triggerId, { ...disposition, engineWait: { ...wait, state: 'confirmation_required' } })
        const event = { type: 'engine_confirmation_required', at: this.now(), data: { triggerId, streamId, reason: 'expired' } } as const
        this.repo.afterCommit(() => this.options.emit?.(event))
      }
      return undefined
    }
    this.repo.triggers.saveDisposition(triggerId, { ...disposition, engineWait: { ...wait, state: 'released' } })
    this.intake.route(trigger)
    return trigger
  }

  /** A person's dismissal permanently prevents routing this retained message. */
  dismiss(triggerId: string): boolean {
    const trigger = this.repo.triggers.get(triggerId)
    const disposition = this.repo.triggers.disposition(triggerId)
    const wait = disposition?.engineWait
    if (!trigger || !disposition || !wait || wait.state === 'released' || wait.state === 'dismissed') return false
    this.repo.triggers.saveDisposition(triggerId, { ...disposition, engineWait: { ...wait, state: 'dismissed' } })
    const thread = this.repo.threads.get(threadKey(trigger.threads[0]!))!
    thread.pending = thread.pending.filter(id => id !== triggerId)
    this.repo.threads.save(thread)
    return true
  }
}
