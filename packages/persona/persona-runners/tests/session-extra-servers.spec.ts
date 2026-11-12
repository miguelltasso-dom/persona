import { describe, expect, it } from 'vitest'
import {
  CLAUDE_CAPABILITIES,
  createOarSessionRunner,
  type RunEvent,
  type StartTurnInput,
  type TurnMcpServer,
  type TurnRunner,
} from '../src/index.ts'

/** A turn runner that records what the session facade hands to `start`. */
function recordingTurn(): { turn: TurnRunner; started: StartTurnInput[] } {
  const started: StartTurnInput[] = []
  const turn: TurnRunner = {
    capabilities: () => CLAUDE_CAPABILITIES,
    health: async () => ({ ok: true, detail: 'x' }),
    authenticate: async () => ({ ok: true, detail: 'x' }),
    start: async (input) => {
      started.push(input)
      return {
        runId: 'r1', sessionId: 's1', ticketId: input.ticketId, assignmentId: input.assignmentId,
        personaId: input.personaId, cwd: input.cwd, model: input.model,
      }
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

const BROWSER: TurnMcpServer = {
  name: 'browser',
  command: 'C:/app/node.exe',
  args: ['C:/app/chrome-devtools-mcp.js', '--browserUrl', 'http://127.0.0.1:9222'],
}

describe('COLHEITA 17: extra MCP servers reach StartTurnInput through the session facade', () => {
  it('carries the servers of THIS turn, and nothing when the opener has none', async () => {
    const { turn, started } = recordingTurn()
    const runner = createOarSessionRunner({
      turn,
      personaId: 'nina',
      model: 'm',
      permissionMode: 'deny',
      purpose: 'talk',
      serversFor: ({ ticketId }) => ticketId === 't1' ? [BROWSER] : undefined,
    })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'Ticket', 'worker')
    await runner.deliver('worker-t1', 'r1', 'abra o site', 'queue')
    expect(started[0]?.extraMcpServers).toEqual([BROWSER])
    await runner.ensureSession('worker-t2', 'C:/tmp/t2', 'Outro', 'worker')
    await runner.deliver('worker-t2', 'r2', 'só texto', 'queue')
    expect(Object.hasOwn(started[1] ?? {}, 'extraMcpServers')).toBe(false)
  })

  it('an empty list is no servers, never an empty attachment', async () => {
    const { turn, started } = recordingTurn()
    const runner = createOarSessionRunner({
      turn,
      personaId: 'nina',
      model: 'm',
      permissionMode: 'deny',
      purpose: 'talk',
      serversFor: () => [],
    })
    await runner.ensureSession('worker-t1', 'C:/tmp/t1', 'Ticket', 'worker')
    await runner.deliver('worker-t1', 'r1', 'oi', 'queue')
    expect(Object.hasOwn(started[0] ?? {}, 'extraMcpServers')).toBe(false)
  })
})
