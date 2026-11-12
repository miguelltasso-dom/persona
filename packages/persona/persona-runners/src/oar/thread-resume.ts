/**
 * Item 2a: one live CLI process per conversation, reopened with `--resume` when the process is gone.
 *
 * The session facade has a session id per turn (a talk reply is `talk-<event>`), so it cannot say which conversation a turn
 * belongs to. The host knows: a talk facade is one channel, and a task facade serves one ticket per session. This wrapper sits
 * between them and the turn runner: it stamps every turn with its thread and remembers the CLI's own session id per thread, so
 * the next turn reattaches even after the pool disposed the process (idle lease, eviction, crash).
 */

import type { RunEvent, RunHandle, Runner, StartTurnInput } from '../contract.ts'

export interface ThreadResumeOptions {
  /** Talk: every session of this facade is the same conversation (one channel). Task: each session is its own conversation. */
  shared: boolean
}

/**
 * Wrap a turn runner so each conversation keeps its own CLI session across process restarts.
 * @param turn - The resolved turn runner (OAR adapter, already wrapped by the resolve chain).
 * @param options - Whether every session of the facade is one conversation.
 */
export function withThreadResume(turn: Runner, options: ThreadResumeOptions): Runner {
  /** The CLI's own session per thread, kept here because the turn runner may be disposed between turns. */
  const native = new Map<string, string>()
  /** The thread of each live run, so a retried run's new native id lands on the right thread. */
  const threadOfRun = new Map<string, string>()

  const threadOf = (input: StartTurnInput): string => (options.shared ? '' : input.ticketId)

  const begin = async (start: (input: StartTurnInput) => Promise<RunHandle>, input: StartTurnInput): Promise<RunHandle> => {
    const threadKey = threadOf(input)
    const remembered = native.get(threadKey)
    const next: StartTurnInput = {
      ...input,
      threadKey,
      ...(input.resumeSessionId === undefined && remembered !== undefined ? { resumeSessionId: remembered } : {}),
    }
    const handle = await start(next)
    native.set(threadKey, handle.sessionId)
    threadOfRun.set(handle.runId, threadKey)
    return handle
  }

  const follow = async function * (events: AsyncIterable<RunEvent>): AsyncIterable<RunEvent> {
    for await (const event of events) {
      // An infra retry opens another native session; the thread follows it, or the next turn would resume the abandoned one.
      if (event.type === 'started') {
        const threadKey = threadOfRun.get(event.handle.runId)
        if (threadKey !== undefined) native.set(threadKey, event.handle.sessionId)
      }
      yield event
    }
  }

  return {
    ...turn,
    start: input => begin(turn.start.bind(turn), input),
    startTurn: input => begin(turn.startTurn.bind(turn), input),
    resume: input => begin(turn.resume.bind(turn), input),
    stream: handle => follow(turn.stream(handle)),
    events: handle => follow(turn.events(handle)),
  }
}
