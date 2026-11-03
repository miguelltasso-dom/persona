/**
 * E4 observe gate: speculative / "só registrar" never starts the inner runner.
 */

import {
  applyAutonomy,
  applyProactivity,
  type AutonomyLevel,
  type ObservedAction,
  type ProactivityRule,
} from '@deepseek-ai/dsh-persona-engine'
import {
  eventTime,
  type RunEvent,
  type RunHandle,
  type Runner,
  type StartTurnInput,
} from '../contract.ts'

export interface ObserveGateOptions {
  rule: ProactivityRule
  autonomy?: AutonomyLevel
  speculative?: boolean
  now?: () => Date
}

export interface ObserveGate {
  runner: Runner
  observed: ObservedAction[]
}

function wouldOf(input: StartTurnInput): string {
  return `start:${input.assignmentId} ${input.prompt}`
}

function decide(options: ObserveGateOptions, would: string):
  | { kind: 'skip' }
  | { kind: 'observe'; action: ObservedAction }
  | { kind: 'run'; action: string } {
  const speculative = options.speculative === true
  if (speculative || options.autonomy !== undefined) {
    const autonomy = applyAutonomy(options.autonomy ?? 'act', would, speculative)
    if (autonomy.kind === 'skip') return { kind: 'skip' }
    if (autonomy.kind === 'observe' || autonomy.kind === 'propose') {
      return { kind: 'observe', action: { ruleId: options.rule.id, would } }
    }
  }
  return applyProactivity(options.rule, would)
}

function syntheticHandle(input: StartTurnInput, runId: string): RunHandle {
  return {
    runId,
    sessionId: `observe-${runId}`,
    ticketId: input.ticketId,
    assignmentId: input.assignmentId,
    personaId: input.personaId,
    cwd: input.cwd,
    model: input.model,
  }
}

/**
 * Wrap a turn runner so observe/off rules record `would` and skip execution.
 * Auto + non-speculative forwards to the inner runner unchanged.
 * @param inner - Real or scripted runner.
 * @param options - Rule, optional autonomy, speculative flag.
 */
export function withObserveGate(inner: Runner, options: ObserveGateOptions): ObserveGate {
  const observed: ObservedAction[] = []
  const now = options.now ?? (() => new Date())
  const held = new Map<string, { handle: RunHandle; events: RunEvent[]; inner?: RunHandle }>()
  let seq = 0

  const record = async (input: StartTurnInput): Promise<RunHandle> => {
    const would = wouldOf(input)
    const decision = decide(options, would)
    if (decision.kind === 'run') {
      const handle = await inner.start(input)
      held.set(handle.runId, { handle, events: [], inner: handle })
      return handle
    }
    const runId = `observe-run-${String(++seq)}`
    const handle = syntheticHandle(input, runId)
    const at = eventTime(now)
    const summary = decision.kind === 'skip'
      ? `skip: ${would}`
      : `observe: ${decision.action.would}`
    if (decision.kind === 'observe') observed.push(decision.action)
    held.set(runId, {
      handle,
      events: [
        { type: 'started', at, handle },
        { type: 'report', at, report: { state: 'waiting', summary } },
        { type: 'ended', at, report: { state: 'waiting', summary } },
      ],
    })
    return handle
  }

  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    const live = held.get(handle.runId)
    if (live === undefined) throw new Error(`unknown run ${handle.runId}`)
    if (live.inner !== undefined) {
      yield* inner.stream(live.inner)
      return
    }
    for (const event of live.events) yield event
  }

  const runner: Runner = {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: record,
    startTurn: record,
    stream: play,
    events: play,
    cancel: async (handle) => {
      const live = held.get(handle.runId)
      if (live?.inner !== undefined) await inner.cancel(live.inner)
    },
    resume: async input => record({ ...input, recovery: true }),
    usage: (handle) => {
      const live = handle === undefined ? undefined : held.get(handle.runId)
      if (live?.inner !== undefined) return inner.usage(live.inner)
      return inner.usage(handle)
    },
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }

  return { runner, observed }
}
