/**
 * Item 2a: one live CLI process per (persona, session), reopened with `--resume` when the process is gone.
 *
 * The first two cases drive the session facade over a scripted runtime (no binary); the last one drives the real Claude runtime
 * against the fake CLI fixture, which speaks stream-json and exits on stdin close.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { claudeRuntime } from '@botiverse/oar/runtimes/claude'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  createClaudeRunner,
  createOarSessionRunner,
  withThreadResume,
  type RunEvent,
  type StartTurnInput,
} from '../src/index.ts'

const input: StartTurnInput = {
  ticketId: 'ticket-cli',
  assignmentId: 'assignment-cli',
  personaId: 'nina',
  cwd: 'C:/tmp/ticket-cli',
  prompt: 'List the files',
  model: 'default',
  permissionMode: 'deny',
}

/** The fake CLI the e2e package owns: a real process that speaks stream-json and exits when its stdin closes. */
const STUB = join(import.meta.dirname, '..', '..', 'persona-e2e', 'fixtures', 'fake-cli', process.platform === 'win32' ? 'claude.cmd' : 'claude')

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function sayingRuntime(text = 'ok') {
  return scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say(text) } })
}

/** A runtime that records the native id and the `resume` option of every session it opens. */
function recordingRuntime() {
  const inner = sayingRuntime('ok')
  const opened: { resume: string | undefined; id: string }[] = []
  const runtime = {
    ...inner,
    session: async (installation: Parameters<typeof inner.session>[0], options: Parameters<typeof inner.session>[1]) => {
      const session = await inner.session(installation, options)
      opened.push({ resume: options.resume, id: session.id })
      return session
    },
  }
  return { runtime, opened }
}

function invocations(log: string): { event: string; argv: string[] }[] {
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').split(/\r?\n/u).filter(line => line.trim() !== '').map(line => JSON.parse(line) as { event: string; argv: string[] })
}

describe('live CLI process per thread', () => {
  it('a second message of the same conversation reattaches with --resume after the process is gone', async () => {
    const { runtime, opened } = recordingRuntime()
    const turn = withThreadResume(createClaudeRunner({ runtime }), { shared: true })
    const session = createOarSessionRunner({ turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny', purpose: 'talk' })
    await session.ensureSession('talk-1', '.', 'Nina', 'coordinator')
    await session.deliver('talk-1', 'req-1', 'oi', 'queue')
    // The pool's idle lease (or a crash) disposed the turn runner: the process is gone, the conversation is not.
    await turn.dispose?.()
    // A talk reply has a session id of its own per message; the channel is still the same thread.
    await session.ensureSession('talk-2', '.', 'Nina', 'coordinator')
    await session.deliver('talk-2', 'req-2', 'e agora?', 'queue')
    expect(opened).toHaveLength(2)
    expect(opened[0]?.resume).toBeUndefined()
    expect(opened[1]?.resume).toBe(opened[0]?.id)
    expect(opened[1]?.id).toBe(opened[0]?.id)
  })

  it('two task sessions never share a live process', async () => {
    const { runtime, opened } = recordingRuntime()
    const turn = withThreadResume(createClaudeRunner({ runtime }), { shared: false })
    const session = createOarSessionRunner({ turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny', purpose: 'task' })
    await session.ensureSession('worker-a', input.cwd, 'A', 'worker')
    await session.ensureSession('worker-b', input.cwd, 'B', 'worker')
    await session.deliver('worker-a', 'req-a', 'tarefa A', 'queue')
    await session.deliver('worker-b', 'req-b', 'tarefa B', 'queue')
    expect(opened).toHaveLength(2)
    expect(opened[1]?.id).not.toBe(opened[0]?.id)
  })

  it.skipIf(!existsSync(STUB))('reopens a crashed conversation with --resume on the next turn', async () => {
    const log = join(tmpdir(), `persona-native-${randomUUID()}.jsonl`)
    const cwd = mkdtempSync(join(tmpdir(), 'persona-thread-'))
    const failFile = join(cwd, 'fail.txt')
    const previous = { log: process.env.FAKE_CLI_LOG, file: process.env.FAKE_CLI_FAIL_FILE }
    process.env.FAKE_CLI_LOG = log
    process.env.FAKE_CLI_FAIL_FILE = failFile
    try {
      const turn = withThreadResume(
        createClaudeRunner({ runtime: claudeRuntime, installation: { kind: 'available', via: 'executable', command: STUB } }),
        { shared: false },
      )
      const first = await turn.start({ ...input, cwd })
      await collect(turn.stream(first))
      // The warm process dies mid-turn (the switch file is read by every turn, so the live process sees it).
      writeFileSync(failFile, 'crash')
      await collect(turn.stream(await turn.start({ ...input, cwd })))
      rmSync(failFile, { force: true })
      const recovered = await turn.start({ ...input, cwd })
      await collect(turn.stream(recovered))
      const resumed = invocations(log)
        .filter(row => row.event === 'invoke' && row.argv.includes('--resume'))
        .map(row => row.argv[row.argv.indexOf('--resume') + 1])
      expect(resumed).toContain(first.sessionId)
      expect(recovered.sessionId).toBe(first.sessionId)
      await turn.dispose?.()
    } finally {
      if (previous.log === undefined) delete process.env.FAKE_CLI_LOG
      else process.env.FAKE_CLI_LOG = previous.log
      if (previous.file === undefined) delete process.env.FAKE_CLI_FAIL_FILE
      else process.env.FAKE_CLI_FAIL_FILE = previous.file
      rmSync(log, { force: true })
      try {
        rmSync(cwd, { recursive: true, force: true })
      } catch (error) {
        // The CLI still holds its working directory when an assertion failed before the dispose above.
        void error
      }
    }
  }, 30_000)
})
