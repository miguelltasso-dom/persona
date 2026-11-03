/**
 * Automatic runner recovery (PRO-3): classify infra failures, hand off via
 * Chain of Recall pointers, retry with backoff on a fresh session.
 */

import {
  eventTime,
  RECOVERY_NOTE,
  type InfraFailureKind,
  type RunEvent,
  type RunHandle,
  type Runner,
  type StartTurnInput,
} from '../contract.ts'

/** Engine contract: 15s / 30s / 60s. */
export const INFRA_BACKOFF_MS = [15_000, 30_000, 60_000] as const

export const INFRA_MAX_ATTEMPTS = 3

const PATTERNS: readonly (readonly [InfraFailureKind, RegExp])[] = [
  ['context_full', /context (?:length|window|overflow)|too many tokens|maximum context|context.?full/iu],
  ['trust_prompt', /do you trust|trust this (?:folder|project|workspace)|permission prompt|waiting for (?:your )?approval|unexpected (?:trust|permission)/iu],
  ['connection_error', /econnreset|enotfound|etimedout|econnrefused|socket hang|network|connection (?:reset|refused|closed)|timed? ?out/iu],
  ['process_dead', /runtime_exited|process (?:exited|died|killed)|spawn (?:enoent|failed)|epipe|esrch|no such process|active writer/iu],
]

export interface InfraRecoveryOptions {
  /** Injected sleeper; tests pass a no-op. */
  wait?: (ms: number) => Promise<void>
  now?: () => Date
  maxAttempts?: number
  /** Optional Chain of Recall ids (neighbors of the failed turn). */
  recallIds?: readonly string[]
}

export interface HandoffInput {
  kind: InfraFailureKind
  attempt: number
  lastSummary: string
  originalPrompt: string
  recallIds?: readonly string[]
}

/**
 * Map a failed-turn summary onto an infra kind, or undefined when it is not recoverable here.
 * @param summary - ended/error text from the runner.
 */
export function classifyInfraFailure(summary: string): InfraFailureKind | undefined {
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(summary)) return kind
  }
  return undefined
}

/**
 * New-session prompt: recovery note + infra kind + recall pointers + original mandate.
 * @param input - failure context.
 */
export function buildHandoffPrompt(input: HandoffInput): string {
  const ids = input.recallIds ?? []
  const recall = ids.length === 0
    ? 'Chain of Recall: none recorded; use the summary and inspect the worktree.'
    : `Chain of Recall: ${ids.map(id => `persona_recall(${id})`).join(', ')}`
  return [
    RECOVERY_NOTE,
    '',
    `Infrastructure: ${input.kind} (attempt ${String(input.attempt)}).`,
    `Previous summary: ${input.lastSummary}`,
    recall,
    '',
    'Original mandate:',
    input.originalPrompt,
  ].join('\n')
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Wrap a turn runner so classified infra failures open a new session and retry.
 * @param inner - DSH or OAR runner.
 * @param options - sleeper, clock, recall ids.
 */
export function withInfraRecovery(inner: Runner, options: InfraRecoveryOptions = {}): Runner {
  const wait = options.wait ?? defaultWait
  const now = options.now ?? (() => new Date())
  const maxAttempts = options.maxAttempts ?? INFRA_MAX_ATTEMPTS
  const inputs = new Map<string, StartTurnInput>()

  const remember = (handle: RunHandle, input: StartTurnInput): RunHandle => {
    inputs.set(handle.runId, input)
    return handle
  }

  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    let current = handle
    let attempt = 0
    for (;;) {
      let ended: Extract<RunEvent, { type: 'ended' }> | undefined
      for await (const event of inner.stream(current)) {
        if (event.type === 'ended') {
          ended = event
          break
        }
        yield event
      }
      if (ended === undefined) return
      const input = inputs.get(current.runId)
      const kind = ended.report.state === 'failed' ? classifyInfraFailure(ended.report.summary) : undefined
      if (kind === undefined || input === undefined || attempt + 1 >= maxAttempts) {
        yield ended
        return
      }
      attempt += 1
      yield {
        type: 'infra',
        at: eventTime(now),
        kind,
        attempt,
        summary: ended.report.summary,
      }
      const delay = INFRA_BACKOFF_MS[Math.min(attempt - 1, INFRA_BACKOFF_MS.length - 1)] ?? INFRA_BACKOFF_MS[0]
      await wait(delay)
      const nextInput: StartTurnInput = {
        ticketId: input.ticketId,
        assignmentId: input.assignmentId,
        personaId: input.personaId,
        cwd: input.cwd,
        model: input.model,
        recovery: true,
        prompt: buildHandoffPrompt({
          kind,
          attempt,
          lastSummary: ended.report.summary,
          originalPrompt: input.prompt,
          ...(options.recallIds === undefined ? {} : { recallIds: options.recallIds }),
        }),
      }
      if (input.permissionMode !== undefined) nextInput.permissionMode = input.permissionMode
      if (input.history !== undefined) nextInput.history = input.history
      const next = remember(await inner.start(nextInput), nextInput)
      current = next
    }
  }

  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: async input => remember(await inner.start(input), input),
    startTurn: async input => remember(await inner.startTurn(input), input),
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: async input => remember(await inner.resume(input), input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}
