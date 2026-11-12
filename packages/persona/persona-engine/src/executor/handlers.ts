/**
 * launch / delivery Effect handlers over the Runner port.
 */

import { latestAssignment, liveTicket, runningAssignment } from '../core/model.ts'
import type { EngineForExecutor } from '../core/engine.ts'
import type { Repositories } from '../core/ports.ts'
import type { Ticket, TicketInput } from '../core/model.ts'
import { Later, type EffectQueue } from '../effects.ts'
import { RECOVERY_NOTE } from '../core/assignments.ts'
import type { Runner } from '../ports/runner.ts'
import { workerSessionId } from '../ports/runner.ts'
import { PrepareFailed, TRANSIENT_TRIES, nextTransientBackoff, transient } from './errors.ts'
import { WorkerSlots } from './slots.ts'

const fromPerson = (input: TicketInput | undefined): boolean =>
  input?.kind === 'trigger' ? input.human === true && input.context !== true : input?.kind === 'text'

export interface ExecutorHost {
  repo: Repositories
  engine: EngineForExecutor
  runner: Runner
  slots: WorkerSlots
  queue: EffectQueue
  paused: () => boolean
  now: () => number
  prepare?: (ticket: Ticket) => Promise<void>
}

/**
 * Bind launch and delivery handlers. Launch concurrency follows free slots;
 * delivery is quiet (failure lives on `ticket.delivery`).
 * @param host - Engine, runner, slots, and queue.
 */
export function bindExecutorEffects(host: ExecutorHost): void {
  const transientTries = new Map<string, number>()
  host.queue.handle('launch', {
    limit: () => host.paused() ? 0 : Math.max(0, host.slots.launches()),
    run: async (payload) => {
      await launchQueued(host, payload.ticketId, payload.assignmentId, transientTries)
    },
  })
  host.queue.handle('delivery', {
    limit: () => host.paused() ? 0 : 4,
    run: async (payload) => {
      await deliverQueued(host, payload.ticketId)
    },
  })
}

async function launchQueued(
  host: ExecutorHost,
  ticketId: string,
  assignmentId: string,
  transientTries: Map<string, number>,
): Promise<void> {
  const ticket = host.repo.tickets.get(ticketId)
  const assignment = ticket && latestAssignment(ticket)
  if (!ticket || !liveTicket(ticket) || assignment?.id !== assignmentId || assignment.state !== 'pending') return
  host.slots.reserve(ticketId, 'launch')
  const key = `launch:${assignmentId}`
  try {
    await host.prepare?.(ticket)
    await host.runner.ensureSession(
      workerSessionId(ticketId),
      ticket.execution?.directory ?? '',
      ticket.title,
      'worker',
    )
    await host.runner.deliver(workerSessionId(ticketId), `launch:${assignmentId}`, ticket.execution?.assignment ?? ticket.title, 'queue')
    host.engine.assignmentStarted(ticketId, assignmentId)
    transientTries.delete(key)
  }
  catch (error) {
    if (error instanceof Later) throw error
    if (error instanceof PrepareFailed || (error instanceof Error && error.message === 'prepare failed')) {
      recordDeliveryFailure(host, ticketId, assignmentId, error instanceof Error ? error.message : String(error))
      return
    }
    if (transient(error)) {
      const tries = transientTries.get(key) ?? 0
      const wait = nextTransientBackoff(tries)
      if (wait !== undefined && tries < TRANSIENT_TRIES) {
        transientTries.set(key, tries + 1)
        throw error
      }
    }
    recordDeliveryFailure(host, ticketId, assignmentId, error instanceof Error ? error.message : String(error))
  }
  finally {
    host.slots.free(ticketId)
  }
}

async function deliverQueued(host: ExecutorHost, ticketId: string): Promise<void> {
  const first = host.repo.tickets.get(ticketId)
  const target = first && liveTicket(first) ? runningAssignment(first) : undefined
  if (!first || !target || first.undelivered.length === 0) return
  let woken = false
  try {
    for (;;) {
      const ticket = host.repo.tickets.get(ticketId)
      const assignment = ticket && liveTicket(ticket) ? runningAssignment(ticket) : undefined
      const inputId = ticket?.undelivered[0]
      if (!ticket || !assignment || inputId === undefined) return
      if (!woken && host.runner.status(workerSessionId(ticketId)) !== 'running') {
        const person = ticket.undelivered.some(id => fromPerson(ticket.inputs.find(item => item.id === id)))
        host.slots.reserve(ticketId, person ? 'person' : 'wake')
        woken = true
      }
      const input = ticket.inputs.find(item => item.id === inputId)
      const text = input && input.kind === 'text' ? input.text : input && input.kind === 'note' ? input.text : `input ${inputId}`
      try {
        if (host.runner.status(workerSessionId(ticketId)) === 'missing') {
          await host.runner.ensureSession(
            workerSessionId(ticketId),
            ticket.execution?.directory ?? '',
            ticket.title,
            'worker',
          )
        }
        // The open turn takes the text without blocking this loop; with no turn open, it becomes the next one.
        const steered = host.runner.steer === undefined
          ? false
          : await host.runner.steer(workerSessionId(ticketId), inputId, text)
        if (!steered) await host.runner.deliver(workerSessionId(ticketId), inputId, text, 'steer')
      }
      catch (error) {
        if (error instanceof Later) throw error
        const current = host.repo.tickets.get(ticketId)
        if (!current || !liveTicket(current) || runningAssignment(current)?.id !== assignment.id) return
        recordDeliveryFailure(host, ticketId, assignment.id, String(error))
        throw error
      }
      host.engine.inputsDelivered(ticketId, assignment.id, [inputId])
    }
  }
  finally {
    if (woken) host.slots.free(ticketId)
  }
}

/**
 * `Engine.deliveryFailed` only writes when the assignment already runs.
 * Launch failures happen while it is still pending, so persist `ticket.delivery` directly.
 */
function recordDeliveryFailure(host: ExecutorHost, ticketId: string, assignmentId: string, error: string): void {
  host.engine.deliveryFailed(ticketId, assignmentId, error)
  host.repo.atomic(() => {
    const ticket = host.repo.tickets.get(ticketId)
    if (!ticket || ticket.delivery) return
    const at = new Date(host.now()).toISOString()
    host.repo.tickets.save({
      ...ticket,
      delivery: { error: error.slice(0, 300), at },
      updatedAt: at,
    })
  })
}

/**
 * Re-deliver unread inputs after a restart, prefixed with {@link RECOVERY_NOTE}
 * when the assignment was interrupted.
 * @param host - Executor host.
 * @param ticketId - Ticket to wake.
 */
export async function redeliverUnread(host: ExecutorHost, ticketId: string): Promise<void> {
  const ticket = host.repo.tickets.get(ticketId)
  if (!ticket || !liveTicket(ticket)) return
  const sessionId = workerSessionId(ticketId)
  await host.runner.ensureSession(sessionId, ticket.execution?.directory ?? '', ticket.title, 'worker')
  await host.runner.deliver(sessionId, `recovery:${ticketId}`, RECOVERY_NOTE, 'queue')
  for (const input of ticket.inputs) {
    if (input.kind !== 'trigger' || input.readAt) continue
    await host.runner.deliver(sessionId, input.id, `input ${input.id}`, 'queue')
  }
}
