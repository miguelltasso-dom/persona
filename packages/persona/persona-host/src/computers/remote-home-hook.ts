/**
 * D-116 executor, the hook where the orchestration chooses the runner of a persona whose home is ANOTHER computer (Keel 12/11; Lumen's gate). The rule that stays on A and fails CLOSED: a turn of A in B never carries a
 * private DM. Where a persona lives is decided by the home book; what may LEAVE this PC for her home is decided here, per turn, from where the turn was born:
 *   - a Task: the conversation of its ticket (a DM is refused; a ticket whose conversation A cannot find is refused);
 *   - a conversation reply: the thread names its stream (`dm:<id>` is refused, `channel:<id>` goes; with a subject after `#`);
 *   - anything else (no context, an old caller): A cannot tell it is not a DM, so it is refused.
 * The refusal is a typed error carrying the sentence the person reads (the orchestration lets it through as it does the dedicated station's).
 */

import type { PersonaRunnerSpec, TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import type { ExecutorSpec } from './executor-protocol.ts'

/** Where the turn the orchestration is about to resolve a runner for was born. */
export interface RemoteTurnContext {
  readonly projectId: string
  /** The Task's ticket (an execution turn). */
  readonly ticketId?: string
  /** The conversation a talk runner serves: `<dm|channel>:<id>`, plus `#<subject>` when the stream has subjects. */
  readonly thread?: string
}

/** What the orchestration calls where it picks the runner. `undefined` = not a remote persona: the host runs her as always. Throws {@link RemoteDmPrivateError} when the turn may not leave this PC. */
export type RemoteRunnerOf = (personaId: string, spec: PersonaRunnerSpec, context?: RemoteTurnContext) => TurnRunner | undefined

/** The turn would carry a private DM to another computer. Its message is the sentence the person reads. */
export class RemoteDmPrivateError extends Error {
  readonly code = 'dm_private' as const

  constructor() {
    super('Esta conversa é particular e a persona roda em outro computador: conversas particulares não vão para lá. Fale com ela num canal, ou peça para trazê-la de volta a este computador.')
    this.name = 'RemoteDmPrivateError'
  }
}

/** @param error - Anything thrown. @returns Whether it is the refusal of a private DM. */
export function isRemoteDmPrivateError(error: unknown): error is RemoteDmPrivateError {
  return error instanceof RemoteDmPrivateError
}

/** What {@link createRemoteRunnerOf} needs. */
export interface RemoteHomeHookDeps {
  /** The turns this PC sends away, once built (`undefined`: the computers are not on here). */
  readonly turns: () => { isRemote(personaId: string): boolean; runnerFor(personaId: string, spec?: ExecutorSpec): TurnRunner } | undefined
  /** The conversation of a Task's ticket (the orchestration's `conversationOfTicket`). */
  readonly conversationOf: (projectId: string, ticketId: string) => { readonly streamKind: 'channel' | 'dm' } | undefined
}

const CLIS: ReadonlySet<string> = new Set(['claude', 'codex', 'cursor', 'opencode'])

const hintOf = (spec: PersonaRunnerSpec): ExecutorSpec => (spec.kind === 'dsh' ? { kind: 'dsh' } : CLIS.has(spec.cli) ? { kind: 'cli', cli: spec.cli as 'claude' | 'codex' | 'cursor' | 'opencode' } : { kind: 'cli' })

/**
 * @param deps - See {@link RemoteHomeHookDeps}.
 * @returns The function the orchestration's `remoteRunnerOf` is set to.
 */
export function createRemoteRunnerOf(deps: RemoteHomeHookDeps): RemoteRunnerOf {
  return (personaId, spec, context) => {
    const turns = deps.turns()
    if (turns === undefined || !turns.isRemote(personaId)) return undefined
    const born = context?.ticketId !== undefined
      ? deps.conversationOf(context.projectId, context.ticketId)?.streamKind
      : context?.thread === undefined ? undefined : context.thread.startsWith('dm:') ? 'dm' : context.thread.startsWith('channel:') ? 'channel' : undefined
    if (born !== 'channel') throw new RemoteDmPrivateError() // a DM, or a turn A cannot place: it stays here
    return turns.runnerFor(personaId, hintOf(spec))
  }
}
