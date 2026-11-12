/**
 * Colheita §6, host side: a conversation turn (#geral/DM) leaves its steps in the same activity book the Task turns use, so the
 * collapsed line "N passos · tempo" (Quill's `TurnStepSummary`) appears there too. One row per tool the turn called — the client folds
 * them into the summary — with the technical detail (the tool name) in the title; the plain Portuguese phrase comes from the client's
 * own locale. A turn that called no tool records nothing.
 */

import type { TurnActivityEvent, TurnActivityKind } from '@deepseek-ai/dsh-persona-core'

/** One tool call of a conversation turn. */
export interface TalkStep {
  readonly tool: string
  readonly at: string
}

/** What one conversation turn leaves behind. */
export interface TalkTurnInput {
  /** The person's message the turn answers: the subject the client asks `listTurnActivity` with. */
  readonly eventId: string
  readonly personaId: string
  readonly steps: readonly TalkStep[]
}

/**
 * @param tool - Tool name as the stream reported it (`Read`, `Bash`, `mcp__…`).
 * @returns The activity kind the UI phrases in Portuguese.
 */
export function stepKindOf(tool: string): TurnActivityKind {
  const id = tool.toLowerCase()
  if (id.includes('hire') || id.includes('assemble')) return 'hire'
  if (id.includes('write') || id.includes('edit') || id.includes('patch') || id.includes('notebook')) return 'file'
  if (id.includes('check') || id.includes('test') || id.includes('lint')) return 'check'
  if (id.includes('message') || id.includes('send') || id.includes('reply')) return 'message'
  if (id.includes('read') || id.includes('glob') || id.includes('grep') || id.includes('list') || id.includes('ls')
    || id.includes('fetch') || id.includes('search') || id.includes('browser')) return 'read'
  return 'command'
}

/**
 * @param input - The turn and its steps.
 * @returns One activity row per step, ready for the host's activity sink; empty when the turn called no tool.
 */
export function talkActivityRows(input: TalkTurnInput): TurnActivityEvent[] {
  return input.steps.map((step, index) => ({
    id: `talk:${input.eventId}:${String(index)}`,
    personaId: input.personaId,
    threadId: input.eventId,
    kind: stepKindOf(step.tool),
    title: step.tool,
    status: 'done',
    at: step.at,
  }))
}
