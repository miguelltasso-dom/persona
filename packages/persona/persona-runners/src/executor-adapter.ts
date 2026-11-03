/**
 * Adapt the engine Runner port to the core `Executor` (start / deliver / stop).
 * Forge owns launch/delivery handlers; this lets tests reuse those scenarios.
 */

import type { Runner } from './port.ts'
import { workerSessionId } from './port.ts'

/** Structural ticket/assignment facts the engine passes into Executor. */
export interface ExecutorTicket {
  id: string
  title?: string
  assignments: readonly { id: string; state: string }[]
}

export interface ExecutorAssignment {
  id: string
}

export interface EngineExecutor {
  start(ticket: ExecutorTicket, assignment: ExecutorAssignment): void
  deliver(ticket: ExecutorTicket, assignment: ExecutorAssignment): void
  stop(ticket: ExecutorTicket, assignment: ExecutorAssignment, reason: string): void
}

export interface ExecutorAdapterOptions {
  runner: Runner
  cwdFor: (ticket: ExecutorTicket) => string
  titleFor?: (ticket: ExecutorTicket) => string
  promptFor?: (ticket: ExecutorTicket, assignment: ExecutorAssignment, kind: 'start' | 'deliver') => string
}

/**
 * Queue Runner sessions from engine Executor callbacks.
 * @param options - port runner and worktree/title mapping.
 */
export function createExecutorAdapter(options: ExecutorAdapterOptions): EngineExecutor {
  const begin = (ticket: ExecutorTicket, assignment: ExecutorAssignment, kind: 'start' | 'deliver'): void => {
    const sessionId = workerSessionId(ticket.id)
    const cwd = options.cwdFor(ticket)
    const title = options.titleFor?.(ticket) ?? ticket.title ?? ticket.id
    const text = options.promptFor?.(ticket, assignment, kind) ?? `${kind}:${ticket.id}`
    const requestId = `${assignment.id}:${kind}`
    void options.runner.ensureSession(sessionId, cwd, title, 'worker').then(() => {
      return options.runner.deliver(sessionId, requestId, text, kind === 'start' ? 'queue' : 'steer')
    })
  }
  return {
    start: (ticket, assignment) => { begin(ticket, assignment, 'start') },
    deliver: (ticket, assignment) => { begin(ticket, assignment, 'deliver') },
    stop: (ticket, _assignment, _reason) => {
      void options.runner.cancel(workerSessionId(ticket.id), { keepInbox: false })
    },
  }
}
