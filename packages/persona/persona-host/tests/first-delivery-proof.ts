/** Shared smoke evidence and call budget; never starts a provider itself. */
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import type { HostRunnerFactory, HostRunnerRequest } from '../src/runner.ts'
import type { FirstDeliveryView, MessageView, TaskView } from '../src/types.ts'

/** One unique delivery attempt, including prompt injection (which may start a model turn). */
export interface DeliveryCall {
  readonly sessionId: string
  readonly requestId: string
  readonly mode: 'queue' | 'steer' | 'inject'
}

/** Shared cap across every runner resolved by one smoke, charged before forwarding a delivery. */
export class DeliveryCallBudget {
  readonly calls: DeliveryCall[] = []
  private readonly sessions = new Map<Runner, Set<string>>()
  private readonly seen = new Map<Runner, Set<string>>()
  private readonly wrapped = new WeakSet<Runner>()

  /** @param inner - Host's real factory. @param limit - Maximum unique delivery attempts. */
  constructor(private readonly inner: HostRunnerFactory, readonly limit: number) {}

  /**
   * Resolve a runner and refuse a delivery that would exceed the smoke's shared cap.
   * @param request - Host request; omission is forwarded to the underlying factory.
   * @returns Runner with idempotent attempts counted independently of diagnostic stages.
   */
  async resolve(request?: HostRunnerRequest): Promise<Runner> {
    const runner = await this.inner(request)
    if (this.wrapped.has(runner)) return runner
    this.wrapped.add(runner)
    const seen = this.seen.get(runner) ?? new Set<string>()
    this.seen.set(runner, seen)
    const sessions = this.sessions.get(runner) ?? new Set<string>()
    this.sessions.set(runner, sessions)
    const deliver = runner.deliver.bind(runner)
    runner.deliver = async (sessionId, requestId, text, mode) => {
      const key = JSON.stringify([sessionId, requestId])
      if (!seen.has(key)) {
        if (this.calls.length >= this.limit) throw new Error('first-delivery-call-budget-exhausted')
        seen.add(key)
        sessions.add(sessionId)
        this.calls.push({ sessionId, requestId, mode })
      }
      await deliver(sessionId, requestId, text, mode)
    }
    return runner
  }

  /** Cancel every session touched by this smoke before unloading its host. */
  async cancelAll(): Promise<void> {
    await Promise.all([...this.sessions].flatMap(([runner, sessions]) =>
      [...sessions].map(sessionId => runner.cancel(sessionId, { keepInbox: false })),
    ))
  }
}

/** Inputs from the persisted host views; diagnostic stage counts are deliberately absent. */
export interface FirstDeliveryProofInput {
  readonly elapsedMs: number
  readonly deadlineMs: number
  readonly milestone: FirstDeliveryView
  readonly tasks: readonly TaskView[]
  readonly events: readonly MessageView[]
}

/**
 * Check independent delivery outcomes without inferring model calls from timings or stages.
 * @param input - Host views after execution settles.
 * @returns Failures plus the actual task reply for the JSON artifact.
 */
export function firstDeliveryProof(input: FirstDeliveryProofInput): {
  broke: string[]
  runnerReply: string
  runnerSource: string
  runnerId: string
} {
  const { milestone, events, tasks } = input
  const broke: string[] = []
  const reply = events.find(event => event.id === `coord-${milestone.ticketId}-done` && event.source === 'runner')
  if (reply === undefined || reply.body.trim() === '') broke.push('no-runner-delivery-on-geral')
  if (milestone.status !== 'ready') broke.push(`first-delivery-${milestone.status}`)
  if (!tasks.some(task => task.id === milestone.ticketId && task.stage === 'done')) broke.push('ticket-not-done')
  if (milestone.feedEventId === '' || events.filter(event => event.id === milestone.feedEventId).length !== 1) {
    broke.push('milestone-not-unique')
  }
  if (input.elapsedMs > input.deadlineMs) broke.push(`ux-phase-a-exceeded-${input.elapsedMs}ms`)
  return {
    broke,
    runnerReply: reply?.body ?? '',
    runnerSource: reply?.source ?? '',
    runnerId: reply?.id ?? '',
  }
}
