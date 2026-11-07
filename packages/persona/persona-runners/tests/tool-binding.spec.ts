import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  CLAUDE_CAPABILITIES,
  createOarRunner,
  createOarSessionRunner,
  CURSOR_CAPABILITIES,
  toolSignature,
  ToolsUnavailableError,
  type RunEvent,
  type ServeHostTools,
  type StartTurnInput,
  type TurnToolSet,
} from '../src/index.ts'

type Handler = (input: Readonly<Record<string, unknown>>, context: { signal: AbortSignal }) => unknown

interface Served {
  name: string
  instructions: string | undefined
  tools: { name: string; handler: Handler }[]
  closed: number
}

/** A stand-in for OAR `serveMcpTools`: records what was served and lets the test play the CLI's tool calls. */
function fakeServe(): { serve: ServeHostTools; served: Served[]; call: (index: number, tool: string, args?: Record<string, unknown>) => Promise<unknown> } {
  const served: Served[] = []
  const serve: ServeHostTools = async (options) => {
    const entry: Served = {
      name: options.name,
      instructions: options.instructions,
      tools: options.tools.map(tool => ({ name: tool.name, handler: tool.handler as Handler })),
      closed: 0,
    }
    served.push(entry)
    return {
      server: { name: options.name, type: 'http', url: `http://127.0.0.1:9/${String(served.length)}`, headers: { authorization: 'Bearer test' } },
      close: async () => { entry.closed += 1 },
    }
  }
  const call = async (index: number, tool: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const row = served[index]?.tools.find(item => item.name === tool)
    if (row === undefined) throw new Error(`tool ${tool} not served`)
    return row.handler(args, { signal: new AbortController().signal })
  }
  return { serve, served, call }
}

function spyRuntime(): { runtime: Runtime; opened: SessionOptions[] } {
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const opened: SessionOptions[] = []
  const runtime = new Proxy(base, {
    get(target, prop) {
      if (prop === 'session') {
        return (installation: never, options: SessionOptions) => {
          opened.push(options)
          return target.session(installation, options)
        }
      }
      const value = Reflect.get(target, prop) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
  return { runtime, opened }
}

function toolSet(label: string, log: string[], extra: Partial<TurnToolSet> = {}): TurnToolSet {
  return {
    tools: [
      {
        name: 'persona_recall',
        description: 'Recall authorized memory.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        handler: async (args) => { log.push(`${label}:recall:${String(args.query)}`); return { content: `memória de ${label}` } },
      },
    ],
    close: () => { log.push(`${label}:closed`) },
    ...extra,
  }
}

const base: StartTurnInput = {
  ticketId: 't-1',
  assignmentId: 'a-1',
  personaId: 'nina',
  cwd: 'C:/tmp/ticket-1',
  prompt: 'Qual é a regra de entrega?',
  model: 'scripted-1',
  permissionMode: 'deny',
}

async function drain(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe('HT-0: product tools served to the live CLI session', () => {
  it('serves the turn tools as an MCP server on the session and allows exactly that server (Claude, dontAsk)', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served } = fakeServe()
    const log: string[] = []
    const runner = createOarRunner({
      runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve,
      policy: { permissionMode: 'deny', toolLevel: 'none', launchArgs: ['--permission-mode', 'dontAsk'], disallowedTools: [] },
    })
    await drain(runner.stream(await runner.start({ ...base, mcpTools: toolSet('a', log, { instructions: 'Persona tools.' }) })))
    expect(served).toHaveLength(1)
    expect(served[0]).toMatchObject({ name: 'persona', instructions: 'Persona tools.' })
    expect(opened).toHaveLength(1)
    expect(opened[0]?.mcpServers).toEqual([expect.objectContaining({ name: 'persona', type: 'http' })])
    expect(opened[0]?.launchArgs).toEqual(['--permission-mode', 'dontAsk', '--allowedTools=mcp__persona'])
  })

  it('a turn without tools opens a session without any MCP server (nothing served, nothing allowed)', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served } = fakeServe()
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    await drain(runner.stream(await runner.start(base)))
    expect(served).toHaveLength(0)
    expect(opened[0]?.mcpServers).toBeUndefined()
    expect(opened[0]?.launchArgs).toBeUndefined()
  })

  it('a CLI without MCP (Cursor) is never handed a server, and its turn still runs', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served } = fakeServe()
    const runner = createOarRunner({ runtime, capabilities: CURSOR_CAPABILITIES, serveTools: serve })
    const events = await drain(runner.stream(await runner.start({ ...base, mcpTools: toolSet('a', []) })))
    expect(events.at(-1)?.type).toBe('ended')
    expect(served).toHaveLength(0)
    expect(opened[0]?.mcpServers).toBeUndefined()
  })

  it('runs the call as the turn in flight and refuses it once the turn is over', async () => {
    const { runtime } = spyRuntime()
    const { serve, call } = fakeServe()
    const log: string[] = []
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    const handle = await runner.start({ ...base, mcpTools: toolSet('a', log) })
    const during = await call(0, 'persona_recall', { query: 'entrega' })
    expect(during).toEqual({ content: [{ type: 'text', text: 'memória de a' }] })
    await drain(runner.stream(handle))
    expect(log).toEqual(['a:recall:entrega', 'a:closed'])
    const after = await call(0, 'persona_recall', { query: 'depois' })
    expect(after).toMatchObject({ isError: true })
    expect(log).not.toContain('a:recall:depois')
  })

  it('a warm session never answers a new turn with the previous turn\'s identity', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served, call } = fakeServe()
    const log: string[] = []
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    await drain(runner.stream(await runner.start({ ...base, assignmentId: 'a-1', mcpTools: toolSet('turn1', log) })))
    const second = await runner.start({ ...base, assignmentId: 'a-2', mcpTools: toolSet('turn2', log) })
    // one session, one server, two turns: the SAME served handler now runs turn 2's bound tool.
    expect(opened).toHaveLength(1)
    expect(served).toHaveLength(1)
    await call(0, 'persona_recall', { query: 'q' })
    expect(log).toContain('turn2:recall:q')
    expect(log).not.toContain('turn1:recall:q')
    await drain(runner.stream(second))
    expect(log.filter(row => row.endsWith(':closed'))).toEqual(['turn1:closed', 'turn2:closed'])
  })

  it('a different tool list (e.g. a lower grant) opens its own session; the old server stays with its session', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served } = fakeServe()
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    const full = toolSet('a', [])
    const narrow: TurnToolSet = { ...toolSet('b', []), tools: [{ ...full.tools[0]!, name: 'persona_recall_lite' }] }
    await drain(runner.stream(await runner.start({ ...base, mcpTools: full })))
    await drain(runner.stream(await runner.start({ ...base, mcpTools: narrow })))
    expect(opened).toHaveLength(2)
    expect(served.map(row => row.tools.map(tool => tool.name))).toEqual([['persona_recall'], ['persona_recall_lite']])
    expect(toolSignature(full)).not.toBe(toolSignature(narrow))
  })

  it('a tool call is ONE progress line (its input/ended frames carry only a callId and are not a tool called "tool")', async () => {
    const runtime = scriptedRuntime({ id: 'fake-cli', turn: async (turn) => { await turn.tool('mcp__persona__persona_recall', '{"query":"x"}', () => 'resultado'); turn.say('feito') } })
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES })
    const events = await drain(runner.stream(await runner.start(base)))
    const tools = events.filter(event => event.type === 'report' && event.report.summary.startsWith('tool:')).map(event => event.type === 'report' ? event.report.summary : '')
    expect(tools).toEqual(['tool:mcp__persona__persona_recall'])
  })

  it('a cancelled turn can no longer reach its tools and releases the lease at once', async () => {
    const { runtime } = spyRuntime()
    const { serve, call } = fakeServe()
    const log: string[] = []
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    const handle = await runner.start({ ...base, mcpTools: toolSet('a', log) })
    await runner.cancel(handle)
    expect(log).toEqual(['a:closed'])
    expect(await call(0, 'persona_recall')).toMatchObject({ isError: true })
  })

  it('dispose closes the lease and the served server; a handler error reaches the model as an error result', async () => {
    const { runtime } = spyRuntime()
    const { serve, served, call } = fakeServe()
    const log: string[] = []
    const set = toolSet('a', log)
    const failing: TurnToolSet = { ...set, tools: [{ ...set.tools[0]!, handler: async () => { throw new Error('ACL: recusado') } }] }
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    const handle = await runner.start({ ...base, mcpTools: failing })
    expect(await call(0, 'persona_recall')).toEqual({ content: [{ type: 'text', text: 'ACL: recusado' }], isError: true })
    await drain(runner.stream(handle))
    await runner.dispose?.()
    expect(served[0]?.closed).toBe(1)
  })

  it('a server that cannot be served fails the turn loudly (tools_unavailable), with nothing left open', async () => {
    const { runtime, opened } = spyRuntime()
    const runner = createOarRunner({
      runtime, capabilities: CLAUDE_CAPABILITIES,
      serveTools: async () => { throw new Error('port busy') },
    })
    await expect(runner.start({ ...base, mcpTools: toolSet('a', []) })).rejects.toBeInstanceOf(ToolsUnavailableError)
    expect(opened).toHaveLength(0)
  })

  it('closes the served server when the session itself cannot open', async () => {
    const base2 = scriptedRuntime({ id: 'fake-cli', turn: () => undefined })
    const runtime = new Proxy(base2, {
      get(target, prop) {
        if (prop === 'session') return () => Promise.reject(new Error('cannot open'))
        const value = Reflect.get(target, prop) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    })
    const { serve, served } = fakeServe()
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    await expect(runner.start({ ...base, mcpTools: toolSet('a', []) })).rejects.toThrow(/cannot open/u)
    expect(served[0]?.closed).toBe(1)
  })

  it('resume keeps the tools (and the effort) so the resumed turn finds its warm session and its server', async () => {
    const { runtime, opened } = spyRuntime()
    const { serve, served } = fakeServe()
    const log: string[] = []
    const runner = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
    await drain(runner.stream(await runner.start({ ...base, effort: 'high', mcpTools: toolSet('a', log) })))
    // The scripted engine has no effort menu: the first open is refused and retried without it (2 `session()` calls, 1 session).
    const openedByFirstTurn = opened.length
    await drain(runner.stream(await runner.resume({ ...base, assignmentId: 'a-2', effort: 'high', mcpTools: toolSet('b', log) })))
    expect(opened).toHaveLength(openedByFirstTurn)
    expect(served).toHaveLength(1)
    expect(log.filter(row => row.endsWith(':closed'))).toEqual(['a:closed', 'b:closed'])
  })

  describe('session port (toolsFor)', () => {
    it('asks the host for the tools of every delivered turn, with that assignment\'s identity', async () => {
      const { runtime } = spyRuntime()
      const { serve, call } = fakeServe()
      const log: string[] = []
      const asked: string[] = []
      const turn = createOarRunner({ runtime, capabilities: CLAUDE_CAPABILITIES, serveTools: serve })
      const session = createOarSessionRunner({
        turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny', purpose: 'talk',
        toolsFor: (ctx) => { asked.push(`${ctx.ticketId}/${ctx.assignmentId}/${ctx.role}`); return toolSet(ctx.assignmentId, log) },
      })
      await session.ensureSession('worker-t-9', 'C:/tmp/t-9', 'Ticket 9', 'worker')
      const running = session.deliver('worker-t-9', 'req-1', 'oi', 'queue')
      await running
      expect(asked).toEqual(['t-9/req-1/worker'])
      expect(log).toEqual(['req-1:closed'])
      void call
    })

    it('releases the host lease when the turn cannot start', async () => {
      const log: string[] = []
      const turn = createOarRunner({
        runtime: scriptedRuntime({ id: 'fake-cli', turn: () => undefined }),
        capabilities: CLAUDE_CAPABILITIES,
        serveTools: async () => { throw new Error('port busy') },
      })
      const session = createOarSessionRunner({
        turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny',
        toolsFor: ctx => toolSet(ctx.assignmentId, log),
      })
      await session.ensureSession('worker-t-9', 'C:/tmp/t-9', 'Ticket 9', 'worker')
      await expect(session.deliver('worker-t-9', 'req-1', 'oi', 'queue')).rejects.toBeInstanceOf(ToolsUnavailableError)
      expect(log).toEqual(['req-1:closed'])
      expect(session.status('worker-t-9')).toBe('idle')
    })
  })
})
