import { describe, expect, it } from 'vitest'
import {
  CLAUDE_CAPABILITIES,
  CODEX_CAPABILITIES,
  createOarSessionRunner,
  ImagesRefusedError,
  type RunEvent,
  type StartTurnInput,
  type TurnCapabilities,
  type TurnRunner,
} from '../src/index.ts'

/** A turn runner that records what the session facade hands to `start`. */
function recordingTurn(capabilities: TurnCapabilities, refuse?: Error): { turn: TurnRunner; started: StartTurnInput[] } {
  const started: StartTurnInput[] = []
  const handle = (input: StartTurnInput) => ({
    runId: 'r1', sessionId: 's1', ticketId: input.ticketId, assignmentId: input.assignmentId,
    personaId: input.personaId, cwd: input.cwd, model: input.model,
  })
  const turn: TurnRunner = {
    capabilities: () => capabilities,
    health: async () => ({ ok: true, detail: 'x' }),
    authenticate: async () => ({ ok: true, detail: 'x' }),
    start: async (input) => {
      if (refuse !== undefined) throw refuse
      started.push(input)
      return handle(input)
    },
    startTurn: async input => turn.start(input),
    stream: async function *(): AsyncIterable<RunEvent> { yield { type: 'ended', at: 'now', report: { state: 'ready', summary: 'ok' } } },
    events: async function *(): AsyncIterable<RunEvent> { yield { type: 'ended', at: 'now', report: { state: 'ready', summary: 'ok' } } },
    cancel: async () => undefined,
    resume: async input => turn.start(input),
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  }
  return { turn, started }
}

async function session(turn: TurnRunner) {
  const runner = createOarSessionRunner({ turn, personaId: 'nina', model: 'm', permissionMode: 'deny', purpose: 'talk' })
  await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'Ticket', 'worker')
  return runner
}

describe('TEAM-5: delivery images reach StartTurnInput through the session facade', () => {
  it('passes the images of THIS delivery (and only if there are any)', async () => {
    const { turn, started } = recordingTurn(CLAUDE_CAPABILITIES)
    const runner = await session(turn)
    await runner.deliver('worker-t1', 'r1', 'opine', 'queue', { images: [{ path: 'C:/anexos/a.png' }, { path: 'C:/anexos/b.jpg', mediaType: 'image/jpeg' }] })
    expect(started[0]?.images).toEqual([{ path: 'C:/anexos/a.png' }, { path: 'C:/anexos/b.jpg', mediaType: 'image/jpeg' }])
    await runner.deliver('worker-t1', 'r2', 'e agora sem imagem', 'queue')
    expect(Object.hasOwn(started[1] ?? {}, 'images')).toBe(false)
    await runner.deliver('worker-t1', 'r3', 'lista vazia', 'queue', { images: [] })
    expect(Object.hasOwn(started[2] ?? {}, 'images')).toBe(false)
  })

  it('advertises capabilities().images only for a CLI that reads images (Claude), never invented for the others', async () => {
    expect((await session(recordingTurn(CLAUDE_CAPABILITIES).turn)).capabilities().images).toBe('available')
    expect((await session(recordingTurn(CODEX_CAPABILITIES).turn)).capabilities().images).toBeUndefined()
  })

  it('a refused image turn surfaces the runner message and leaves the session idle and retryable', async () => {
    const refusal = new ImagesRefusedError('engine')
    const { turn } = recordingTurn(CODEX_CAPABILITIES, refusal)
    const runner = await session(turn)
    await expect(runner.deliver('worker-t1', 'r1', 'opine', 'queue', { images: [{ path: 'C:/a.png' }] })).rejects.toBe(refusal)
    expect(runner.status('worker-t1')).toBe('idle')
    // the same request id is a real retry, not a silent "already delivered"
    const again = recordingTurn(CLAUDE_CAPABILITIES)
    const retry = await session(again.turn)
    await retry.deliver('worker-t1', 'r1', 'opine', 'queue')
    expect(again.started).toHaveLength(1)
  })
})
