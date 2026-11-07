/**
 * ISO-4 (D-081 a): main-loop counters next to the total, and the start-frame summary (counts only).
 * Pure functions first, then through the adapter with a fake OAR session (no real CLI, no model).
 */
import type { RawEvent, SessionUsage } from '@botiverse/oar'
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, type RunEvent, type StartTurnInput } from '../src/index.ts'
import { environmentOf, mainLoopOf } from '../src/oar/usage-detail.ts'

const tokens = (input: number, output: number) => ({ input, output })

describe('mainLoopOf: the root agent\'s share, never an estimate', () => {
  it('takes the root agent\'s entry when OAR broke the usage down, and leaves the rest as the auxiliary spend', () => {
    const usage: SessionUsage = {
      total: tokens(305_652, 1_183),
      byAgent: [{ agentPath: [], tokens: tokens(43_700, 1_100) }],
      unattributed: tokens(261_952, 83),
    }
    expect(mainLoopOf(usage)).toEqual({ inputTokens: 43_700, outputTokens: 1_100 })
  })

  it('with no breakdown and nothing unattributed the total IS the root agent\'s', () => {
    expect(mainLoopOf({ total: tokens(2_725, 2) })).toEqual({ inputTokens: 2_725, outputTokens: 2 })
  })

  it('is unknown (absent, never 0) when the runtime did not tell the root apart', () => {
    expect(mainLoopOf({ total: null })).toBeUndefined()
    // part of the total belongs to no agent and no entry is the root
    expect(mainLoopOf({ total: tokens(100, 10), unattributed: tokens(60, 4) })).toBeUndefined()
    // a breakdown that does not name the root agent
    expect(mainLoopOf({ total: tokens(100, 10), byAgent: [{ agentPath: ['sub-1'], tokens: tokens(100, 10) }] })).toBeUndefined()
  })

  it('a zero the runtime reported stays a zero', () => {
    expect(mainLoopOf({ total: tokens(0, 0) })).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

function frame(type: string, native: unknown, agentPath: readonly string[] = [], seq = 1): RawEvent {
  return { kind: 'frame', sessionId: 's1', agentPath, seq, receivedAt: 0, body: { type, native, events: [] } }
}

const INIT = {
  type: 'system', subtype: 'init', model: 'claude-haiku-5-5',
  tools: ['Read', 'Write', 'Edit'],
  mcp_servers: [{ name: 'secret-gmail-connector', status: 'connected' }, { name: 'drive', status: 'needs-auth' }],
  slash_commands: ['/a', '/b', '/c', '/d'],
  skills: ['s1', 's2'],
  plugins: [{ name: 'private-plugin', path: 'C:/Users/ana/.claude/plugins/x' }],
}

describe('environmentOf: what the session loaded, as counts', () => {
  it('summarises the root system/init frame', () => {
    expect(environmentOf([frame('system/init', INIT)])).toEqual({
      tools: 3, mcpServers: 2, skills: 2, slashCommands: 4, plugins: 1, model: 'claude-haiku-5-5',
    })
  })

  it('never carries a name: servers, tools, skills and plugin paths stay out', () => {
    const text = JSON.stringify(environmentOf([frame('system/init', INIT)]))
    for (const secret of ['secret-gmail-connector', 'drive', 'private-plugin', 'ana', 'Read', 's1']) expect(text).not.toContain(secret)
  })

  it('leaves a field out when the frame does not report it, and says nothing when it reports none', () => {
    expect(environmentOf([frame('system/init', { tools: ['a'], model: 'm' })])).toEqual({ tools: 1, model: 'm' })
    expect(environmentOf([frame('system/init', {})])).toBeUndefined()
    expect(environmentOf([frame('system/init', null)])).toBeUndefined()
  })

  it('ignores other frames, requests, and a sub-agent\'s own init; uses the first root init', () => {
    const records: RawEvent[] = [
      frame('assistant', { tools: ['x'] }),
      frame('system/init', { tools: ['sub'] }, ['sub-1']),
      frame('system/init', { tools: ['a', 'b'] }, [], 3),
      frame('system/init', { tools: ['a', 'b', 'c', 'd'] }, [], 9),
    ]
    expect(environmentOf(records)).toEqual({ tools: 2 })
    expect(environmentOf([])).toBeUndefined()
  })
})

const input: StartTurnInput = {
  ticketId: 'ticket-iso4', assignmentId: 'assignment-iso4', personaId: 'nina', cwd: 'C:/tmp/iso4',
  prompt: 'oi', model: 'scripted-1', permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

/** A fake OAR runtime whose session reports the given usage (once the prompt has run, as a real cold session: it starts at zero) and records (no CLI). */
function runtimeReporting(usage: SessionUsage, records?: readonly RawEvent[]) {
  return {
    id: 'fake-claude',
    session: async () => {
      const listeners: Array<(event: { kind: string; text?: string }) => void> = []
      let prompted = false
      return {
        id: 'sess-1',
        events: (listener: (event: { kind: string; text?: string }) => void) => { listeners.push(listener); return () => undefined },
        prompt: async () => { prompted = true; for (const listener of listeners) listener({ kind: 'text_delta', text: 'ok' }); return { kind: 'ok' } },
        abort: async () => undefined,
        dispose: async () => undefined,
        usage: () => ({ value: prompted ? usage : { total: { input: 0, output: 0 } } }),
        status: () => ({ value: { kind: 'idle' as const } }),
        ...(records === undefined ? {} : { records: () => records }),
      }
    },
  }
}

describe('the adapter publishes the main loop and the environment next to the total (additive)', () => {
  it('RunnerUsage carries total, main loop and counts; the total is unchanged', async () => {
    const usage: SessionUsage = {
      total: { input: 305_652, output: 1_183, cacheRead: 299_762, cacheWrite: 5_888 },
      byAgent: [{ agentPath: [], tokens: tokens(43_700, 1_100) }],
      unattributed: tokens(261_952, 83),
    }
    const runner = createClaudeRunner({ runtime: runtimeReporting(usage, [frame('system/init', INIT)]) as never })
    const handle = await runner.start(input)
    await collect(runner.stream(handle))
    const spent = await runner.usage(handle)
    expect(spent).toMatchObject({
      inputTokens: 305_652, outputTokens: 1_183, cacheReadTokens: 299_762, cacheWriteTokens: 5_888,
      mainLoopInputTokens: 43_700, mainLoopOutputTokens: 1_100,
      environment: { tools: 3, mcpServers: 2, skills: 2, slashCommands: 4, plugins: 1, model: 'claude-haiku-5-5' },
    })
    // auxiliary spend is simply total − main loop, derivable by any consumer
    expect((spent.inputTokens) - (spent.mainLoopInputTokens ?? 0)).toBe(261_952)
  })

  it('a session without records() or a breakdown behaves exactly as before: only the total, plus the root as main loop', async () => {
    const runner = createClaudeRunner({ runtime: runtimeReporting({ total: tokens(2, 1) }) as never })
    const handle = await runner.start(input)
    await collect(runner.stream(handle))
    const spent = await runner.usage(handle)
    expect(spent).toEqual({ inputTokens: 2, outputTokens: 1, mainLoopInputTokens: 2, mainLoopOutputTokens: 1 })
    expect(spent.environment).toBeUndefined()
  })

  it('a breakdown with no root entry leaves the main loop ABSENT, never a guess', async () => {
    const usage: SessionUsage = { total: tokens(100, 10), unattributed: tokens(100, 10) }
    const runner = createClaudeRunner({ runtime: runtimeReporting(usage) as never })
    const handle = await runner.start(input)
    await collect(runner.stream(handle))
    const spent = await runner.usage(handle)
    expect(spent.inputTokens).toBe(100)
    expect('mainLoopInputTokens' in spent).toBe(false)
    expect('mainLoopOutputTokens' in spent).toBe(false)
  })
})
