import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AvailableInstallation, Session, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  createClaudeRunner,
  createCodexRunner,
  createCursorRunner,
  createOarSessionRunner,
  createOpencodeRunner,
  CURSOR_CAPABILITIES,
  type RunEvent,
  type StartTurnInput,
} from '../src/index.ts'

const input: StartTurnInput = {
  ticketId: 'ticket-cli',
  assignmentId: 'assignment-cli',
  personaId: 'nina',
  cwd: 'C:/tmp/ticket-cli',
  prompt: 'List the files',
  model: 'scripted-1',
  permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function sayingRuntime(text = 'ok') {
  return scriptedRuntime({
    id: 'fake-cli',
    turn: (turn) => { turn.say(text) },
  })
}

describe('OAR CLI runners', () => {
  it('refuses a Claude session without an explicit permission mode', async () => {
    const runner = createClaudeRunner({ runtime: sayingRuntime() })
    const { permissionMode: _ignored, ...bare } = input
    await expect(runner.start(bare)).rejects.toThrow(/permission mode required/u)
  })

  it('refuses prompt on a CLI (OAR cannot answer approvals)', async () => {
    const runner = createClaudeRunner({ runtime: sayingRuntime() })
    await expect(runner.start({ ...input, permissionMode: 'prompt' })).rejects.toThrow(/não aceita modo prompt/u)
  })

  it('streams Claude scriptedRuntime events without opening a real CLI', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'persona-claude-'))
    const runner = createClaudeRunner({ runtime: sayingRuntime('hello from claude'), configDir })
    expect(runner.capabilities()).toMatchObject({ cli: 'claude', permission: 'explicit', mcpTools: 'available' })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events[0]?.type).toBe('started')
    expect(events.some(event => event.type === 'delta' && event.text === 'hello from claude')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    expect((await runner.usage(handle)).outputTokens).toBeGreaterThan(0)
  })

  it('cancels an in-flight Claude turn', async () => {
    const runner = createClaudeRunner({
      runtime: scriptedRuntime({
        turn: async (turn) => {
          turn.say('before')
          await new Promise<void>((_resolve, reject) => {
            if (turn.signal.aborted) { reject(new Error('aborted')); return }
            turn.signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
          })
        },
      }),
    })
    const handle = await runner.start(input)
    const iter = runner.stream(handle)[Symbol.asyncIterator]()
    await iter.next()
    await runner.cancel(handle)
    const rest: RunEvent[] = []
    for (;;) {
      const step = await iter.next()
      if (step.done === true) break
      rest.push(step.value)
    }
    expect(rest.some(event => event.type === 'ended' && event.report.state === 'dropped')).toBe(true)
  })

  it('runs Codex the same way', async () => {
    const runner = createCodexRunner({ runtime: sayingRuntime('codex') })
    expect(runner.capabilities().cli).toBe('codex')
    const events = await collect(runner.stream(await runner.start(input)))
    expect(events.some(event => event.type === 'delta' && event.text === 'codex')).toBe(true)
  })

  it('refuses OpenCode resume in a different cwd', async () => {
    const runner = createOpencodeRunner({ runtime: sayingRuntime('opencode') })
    const first = await runner.start(input)
    await collect(runner.stream(first))
    await expect(runner.resume({
      ...input,
      cwd: 'C:/tmp/other',
      resumeSessionId: first.sessionId,
    })).rejects.toThrow(/same cwd/u)
  })

  it('advertises Cursor MCP tools as unavailable', () => {
    const runner = createCursorRunner({ runtime: sayingRuntime('cursor') })
    expect(runner.capabilities()).toEqual(CURSOR_CAPABILITIES)
    expect(runner.capabilities().mcpTools).toBe('unavailable')
  })

  it('exposes Claude through the session Runner port with explicit permission', async () => {
    const session = createOarSessionRunner({
      turn: createClaudeRunner({ runtime: sayingRuntime('from session') }),
      personaId: 'nina',
      model: 'scripted-1',
      permissionMode: 'deny',
    })
    await session.ensureSession('worker-cli', input.cwd, 'List', 'worker')
    await session.deliver('worker-cli', 'req-1', 'List the files', 'queue')
    await session.deliver('worker-cli', 'req-1', 'List the files', 'queue')
    expect(session.status('worker-cli')).toBe('idle')
    expect(session.capabilities().tools).toBe('mcp')
  })

  it('unsets leftover isolation unless configDir or homeDir is explicit', async () => {
    let env: Record<string, string | null> | undefined
    const inner = sayingRuntime()
    const runtime = {
      ...inner,
      session: async (installation: AvailableInstallation, options: SessionOptions) => {
        env = options.env === undefined ? undefined : { ...options.env }
        return inner.session(installation, options)
      },
    }
    await createClaudeRunner({ runtime }).start(input)
    expect(env?.CLAUDE_CONFIG_DIR).toBeNull()
    expect(env?.CODEX_HOME).toBeNull()

    await createClaudeRunner({ runtime, configDir: 'C:/tmp/iso-claude' }).start(input)
    expect(env?.CLAUDE_CONFIG_DIR).toBe('C:/tmp/iso-claude')

    await createCodexRunner({ runtime, homeDir: 'C:/tmp/iso-codex' }).start(input)
    expect(env?.CODEX_HOME).toBe('C:/tmp/iso-codex')
  })

  it('reuses the warm CLI session on a second turn', async () => {
    let opens = 0
    const inner = sayingRuntime('ok')
    const runtime = {
      ...inner,
      session: async (installation: AvailableInstallation, options: SessionOptions) => {
        opens += 1
        return inner.session(installation, options)
      },
    }
    const runner = createClaudeRunner({ runtime })
    const first = await runner.start(input)
    await collect(runner.stream(first))
    const second = await runner.start({ ...input, prompt: 'again' })
    await collect(runner.stream(second))
    expect(opens).toBe(1)
    expect(second.sessionId).toBe(first.sessionId)
    await runner.dispose?.()
  })

  it('emits the first delta immediately and a cumulative partial', async () => {
    const runner = createClaudeRunner({ runtime: sayingRuntime('Hi') })
    const events = await collect(runner.stream(await runner.start(input)))
    const deltaAt = events.findIndex(event => event.type === 'delta' && event.text === 'Hi')
    const partial = events.find(event => event.type === 'partial')
    expect(deltaAt).toBeGreaterThan(0)
    expect(partial).toMatchObject({ type: 'partial', text: 'Hi' })
    await runner.dispose?.()
  })

  it('disposes the live Codex session before resume when the warm slot missed', async () => {
    const order: string[] = []
    const inner = sayingRuntime('ok')
    const runtime = {
      ...inner,
      session: async (installation: AvailableInstallation, options: SessionOptions) => {
        order.push(`open:${options.resume ?? 'new'}`)
        const session = await inner.session(installation, options)
        return new Proxy(session, {
          get(target: Session, prop: string | symbol, receiver: unknown) {
            if (prop === 'dispose') {
              return async () => {
                order.push('dispose')
                return target.dispose()
              }
            }
            const value = Reflect.get(target, prop, receiver)
            return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(target) : value
          },
        })
      },
    }
    const runner = createCodexRunner({ runtime, warmTtlMs: 0 })
    const first = await runner.start(input)
    await collect(runner.stream(first))
    await runner.resume({ ...input, resumeSessionId: first.sessionId })
    expect(order[0]).toBe('open:new')
    expect(order).toContain('dispose')
    expect(order.at(-1)).toBe(`open:${first.sessionId}`)
    expect(order.indexOf('dispose')).toBeLessThan(order.length - 1)
  })

  it('omits model when the caller asks for default so Codex uses the CLI default', async () => {
    let seen: string | undefined
    const inner = sayingRuntime('ok')
    const runtime = {
      ...inner,
      session: async (_installation: AvailableInstallation, options: SessionOptions) => {
        seen = options.model
        return inner.session(_installation, options)
      },
    }
    await createCodexRunner({ runtime }).start({ ...input, model: 'default' })
    expect(seen).toBeUndefined()
    await createCodexRunner({ runtime }).start({ ...input, model: 'gpt-5.4' })
    expect(seen).toBe('gpt-5.4')
  })

  it('ends a Codex turn when prompt settles without turn_ended and maps agent_message text', async () => {
    const inner = sayingRuntime()
    const runtime = {
      ...inner,
      session: async () => {
        const listeners: Array<(event: { kind: string; text?: string }) => void> = []
        return {
          id: 'codex-thread-1',
          events: (listener: (event: { kind: string; text?: string }) => void) => {
            listeners.push(listener)
            return () => undefined
          },
          prompt: async () => {
            for (const listener of listeners) listener({ kind: 'agent_message', text: 'OK' })
            return { kind: 'ok' }
          },
          abort: async () => undefined,
          dispose: async () => undefined,
          usage: () => ({ value: { total: { input: 2, output: 1 } } }),
          status: () => ({ value: { kind: 'idle' as const } }),
        }
      },
    }
    const runner = createCodexRunner({ runtime: runtime as never })
    const events = await collect(runner.stream(await runner.start(input)))
    expect(events.some(item => item.type === 'delta' && item.text === 'OK')).toBe(true)
    expect(events.some(item => item.type === 'ended' && item.report.state === 'ready')).toBe(true)
  })

  it('carrega os MCP servers extras do turno e não reusa a sessão quente aberta sem eles', async () => {
    const seen: (readonly string[] | undefined)[] = []
    const inner = sayingRuntime('ok')
    const runtime = {
      ...inner,
      session: async (installation: AvailableInstallation, options: SessionOptions) => {
        seen.push(options.mcpServers?.map(server => server.name))
        return inner.session(installation, options)
      },
    }
    const runner = createClaudeRunner({ runtime })
    const browser = [{ name: 'browser', command: 'node', args: ['chrome-devtools-mcp.js', '--browserUrl', 'http://127.0.0.1:9222'] }] as const
    const first = await runner.start({ ...input, extraMcpServers: browser })
    await collect(runner.stream(first))
    const second = await runner.start({ ...input })
    await collect(runner.stream(second))
    expect(seen).toEqual([['browser'], undefined])
    expect(second.sessionId).not.toBe(first.sessionId)
    await runner.dispose?.()
  })

  it('um CLI sem MCP não recebe os servers extras', async () => {
    const seen: (readonly string[] | undefined)[] = []
    const inner = sayingRuntime('ok')
    const runtime = {
      ...inner,
      session: async (installation: AvailableInstallation, options: SessionOptions) => {
        seen.push(options.mcpServers?.map(server => server.name))
        return inner.session(installation, options)
      },
    }
    const runner = createCursorRunner({ runtime })
    await collect(runner.stream(await runner.start({ ...input, extraMcpServers: [{ name: 'browser', command: 'node', args: [] }] })))
    expect(seen).toEqual([undefined])
    await runner.dispose?.()
  })
})
