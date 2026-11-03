/**
 * Recovery after a host restart (P8).
 */

import { latestAssignment, latestReport, runningAssignment, waitsForPerson } from '../core/model.ts'
import type { Ticket } from '../core/model.ts'
import type { ExecutorHost } from './handlers.ts'
import { redeliverUnread } from './handlers.ts'
import { workerSessionId } from '../ports/runner.ts'

const settledReport = (state: string | undefined): boolean =>
  state === 'waiting' || state === 'ready' || state === 'blocked' || state === 'failed'

/**
 * Reconcile open tickets after restart.
 * A running assignment that was mid-work restarts with {@link RECOVERY_NOTE}
 * and unread inputs. waiting/ready/blocked/failed with no input since the
 * report keeps the session and only flushes undelivered inputs.
 * @param host - Executor host.
 */
export async function resumeExecutor(host: ExecutorHost): Promise<void> {
  const open = host.repo.tickets.open().slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const ticket of open) {
    const running = runningAssignment(ticket)
    const latest = latestAssignment(ticket)
    if (running) {
      const report = latestReport(ticket)?.state
      const busy = !!running.deliveredAt && !!running.report && running.deliveredAt >= running.report.at
      if (settledReport(report) && !busy) {
        await host.runner.ensureSession(
          workerSessionId(ticket.id),
          ticket.execution?.directory ?? '',
          ticket.title,
          'worker',
        )
        if (ticket.undelivered.length) host.engine.inputsDelivered(ticket.id, running.id, [])
        continue
      }
      await host.runner.cancel(workerSessionId(ticket.id), { keepInbox: true })
      host.engine.assignmentInterrupted(ticket.id, running.id)
      await redeliverUnread(host, ticket.id)
    }
    else if (latest?.state === 'pending' && !waitsForPerson(ticket) && !ticket.delivery) {
      host.queue.enqueue('launch', latest.id, { ticketId: ticket.id, assignmentId: latest.id })
    }
  }
}

/**
 * Whether a worker that went idle should be reported `waiting` because the
 * runner cannot keep background jobs.
 * @param ticket - Ticket whose assignment just went idle.
 * @param hasBackground - Runner {@link RunnerCapabilities.background}.
 * @param handedToPerson - Latest report is ready/blocked/failed or attention is open.
 */
export function idleOutcome(
  ticket: Pick<Ticket, 'attention'>,
  hasBackground: boolean,
  handedToPerson: boolean,
): 'waiting' | 'background' | 'person' {
  if (handedToPerson || ticket.attention) return 'person'
  if (!hasBackground) return 'waiting'
  return 'background'
}

/** How long leftover background work may run after a turn (30 minutes). */
export const BACKGROUND_LIMIT_MS = 30 * 60_000
