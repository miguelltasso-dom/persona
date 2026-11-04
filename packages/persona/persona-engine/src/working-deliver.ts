/**
 * Map composer queue/steer onto the runner (T3-UX-HARVEST §4).
 *
 * The pure mapping only, pinned by `working-deliver.spec.ts` and the e2e contract test. The host's IV-5 (Direcionar agora,
 * fila persistida, Parar — `contracts/working-control.md`) talks to the {@link Runner} port directly and does not call
 * these two helpers, so nothing in the host depends on them.
 */

import {
  resolveWorkingSend,
  type QueuedUserMessage,
  type WorkingSendMode,
} from '@deepseek-ai/dsh-persona-core'
import type { Runner } from './ports/runner.ts'

/**
 * Deliver one composer send. Idle always steers. Working uses prefer / Ctrl+Enter.
 * @param runner - Session runner.
 * @param sessionId - Worker or coordinator session.
 * @param requestId - Idempotent delivery id.
 * @param text - User text.
 * @param working - Open turn.
 * @param prefer - Default button.
 * @param alternate - Ctrl+Enter.
 */
export async function deliverWorkingSend(
  runner: Pick<Runner, 'deliver'>,
  sessionId: string,
  requestId: string,
  text: string,
  working: boolean,
  prefer: WorkingSendMode,
  alternate: boolean,
): Promise<WorkingSendMode> {
  const mode = resolveWorkingSend(working, prefer, alternate)
  await runner.deliver(sessionId, requestId, text, mode)
  return mode
}

/**
 * Flush dashed bubbles in order. Does not drop them on failure.
 * @param runner - Session runner.
 * @param sessionId - Session.
 * @param queue - Stored queue.
 */
export async function flushWorkingQueue(
  runner: Pick<Runner, 'deliver'>,
  sessionId: string,
  queue: readonly QueuedUserMessage[],
): Promise<void> {
  for (const row of queue) {
    await runner.deliver(sessionId, row.id, row.text, 'queue')
  }
}
