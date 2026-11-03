/**
 * Drive the coordination-function session (preset without bash, P6 prompt, D-041).
 */

import type { DeliverMode, Runner } from '../port.ts'
import { toolsForRole } from '../port.ts'
export { COORDINATION_SESSION_ID, coordinationPrompt, type CoordinationPersona } from './prompt.ts'
import { COORDINATION_SESSION_ID, coordinationPrompt, type CoordinationPersona } from './prompt.ts'

const COORDINATION_TOOLS = [
  'persona_eval',
  'persona_eval_decide',
  'persona_route',
  'persona_ask',
  'persona_recall',
  'persona_report',
  'read',
] as const

export interface CoordinationDriverOptions {
  runner: Runner
  persona: CoordinationPersona
  cwd: string
  /** Override when Forge P6 exports the production prompt. */
  prompt?: string
}

export interface CoordinationDriver {
  sessionId: string
  persona: CoordinationPersona
  prompt: string
  tools: readonly string[]
  start(): Promise<void>
  deliver(requestId: string, text: string, mode?: DeliverMode): Promise<void>
  cancel(keepInbox?: boolean): Promise<void>
  whenIdle(): Promise<void>
}

/**
 * Bind a long coordination session on a Runner. Steer / followup / inject are
 * idempotent on `requestId` because the Runner port already is (D-041).
 * @param options - runner, persona identity, worktree, optional P6 prompt.
 */
export function createCoordinationDriver(options: CoordinationDriverOptions): CoordinationDriver {
  const prompt = options.prompt ?? coordinationPrompt(options.persona)
  const tools = toolsForRole('coordinator', COORDINATION_TOOLS)
  return {
    sessionId: COORDINATION_SESSION_ID,
    persona: options.persona,
    prompt,
    tools,
    start: async () => {
      await options.runner.ensureSession(COORDINATION_SESSION_ID, options.cwd, options.persona.name, 'coordinator')
      await options.runner.deliver(COORDINATION_SESSION_ID, `${options.persona.id}:prompt`, prompt, 'inject')
    },
    deliver: async (requestId: string, text: string, mode: DeliverMode = 'queue') => {
      await options.runner.deliver(COORDINATION_SESSION_ID, requestId, text, mode)
    },
    cancel: async (keepInbox: boolean = false) => {
      await options.runner.cancel(COORDINATION_SESSION_ID, { keepInbox })
    },
    whenIdle: async () => {
      await options.runner.whenIdle(COORDINATION_SESSION_ID)
    },
  }
}

/**
 * Count words in a coordination reply (channel cap is 100).
 * @param text - reply body.
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(part => part.length > 0).length
}
