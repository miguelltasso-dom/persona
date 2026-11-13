import { describe, expect, it, vi } from 'vitest'
import type { StartTurnInput } from '@deepseek-ai/dsh-persona-runners'
import {
  EXECUTOR_MAX_EVENTS, EXECUTOR_MAX_HISTORY, EXECUTOR_MAX_PROMPT, EXECUTOR_MAX_TOOLS, EXECUTOR_TURN_TTL_MS, cleanOp, cleanStart, inputOf, startOf, type ExecutorStart,
} from '../src/computers/executor-protocol.ts'

/**
 * D-116 executor wire: every field is rebuilt from the allowed ones at both ends, every size is capped, and what must never travel (a working directory, an image, a tool's handler) does not.
 */
const NOW = 1_800_000_000_000
const base = (): Record<string, unknown> => ({
  op: 'start', turnId: 't1', personaId: 'nina', epoch: 4, sessionId: 'tk1', ticketId: 'tk1', assignmentId: 'as1', prompt: 'Resuma o dia.', model: 'sonnet', notAfter: NOW + 1_000,
  tools: [{ name: 'post_message', description: 'Fala no canal.', inputSchema: { type: 'object' } }],
})

describe('cleanStart', () => {
  it('accepts a well-formed start and rebuilds it from the allowed fields only (an unknown field, a cwd, an image, a handler are dropped)', () => {
    const cleaned = cleanStart({ ...base(), cwd: 'C:\\Users\\ana\\projeto', images: [{ path: 'C:\\x.png' }], extraMcpServers: [{ name: 'x', command: 'evil', args: [] }], resumeSessionId: 'abc', tools: [{ name: 'post_message', description: 'd', inputSchema: {}, handler: 'x' }], history: [{ role: 'user', text: 'oi', extra: 1 }], effort: 'high', authority: 'person' })
    if (typeof cleaned === 'string') throw new Error(cleaned)
    expect(Object.keys(cleaned).sort()).toEqual(['assignmentId', 'authority', 'effort', 'epoch', 'history', 'model', 'notAfter', 'op', 'personaId', 'prompt', 'sessionId', 'ticketId', 'tools', 'turnId'])
    expect(cleaned.tools).toEqual([{ name: 'post_message', description: 'd', inputSchema: {} }])
    expect(cleaned.history).toEqual([{ role: 'user', text: 'oi' }])
  })

  it('refuses what is not a start, and every field of the wrong kind', () => {
    for (const bad of [null, 'x', [], {}, { ...base(), op: 'cancel' }, { ...base(), turnId: '' }, { ...base(), turnId: 'a b' }, { ...base(), personaId: 42 }, { ...base(), epoch: -1 }, { ...base(), epoch: 1.5 }, { ...base(), notAfter: 'amanhã' },
      { ...base(), prompt: 42 }, { ...base(), model: undefined }, { ...base(), tools: 'x' }, { ...base(), tools: [{ name: 'a b', description: 'd', inputSchema: {} }] }, { ...base(), tools: [{ name: 'ok', description: 'd', inputSchema: 'x' }] },
      { ...base(), history: 'x' }, { ...base(), history: [{ role: 'system', text: 'x' }] }, { ...base(), permissionMode: 'all' }, { ...base(), authority: 'root' }, { ...base(), recovery: 'sim' }, { ...base(), toolServer: 'a b' }]) {
      expect(cleanStart(bad), JSON.stringify(bad)).toBe('malformed')
    }
  })

  it('refuses what is too big: the prompt, the history, the tools, one schema', () => {
    expect(cleanStart({ ...base(), prompt: 'x'.repeat(EXECUTOR_MAX_PROMPT + 1) })).toBe('too-big')
    expect(cleanStart({ ...base(), history: Array.from({ length: EXECUTOR_MAX_HISTORY + 1 }, () => ({ role: 'user', text: 'x' })) })).toBe('too-big')
    expect(cleanStart({ ...base(), tools: Array.from({ length: EXECUTOR_MAX_TOOLS + 1 }, (_, index) => ({ name: `t${String(index)}`, description: 'd', inputSchema: {} })) })).toBe('too-big')
    expect(cleanStart({ ...base(), tools: [{ name: 'big', description: 'd', inputSchema: { x: 'y'.repeat(25_000) } }] })).toBe('too-big')
    expect(cleanStart({ ...base(), prompt: 'x'.repeat(EXECUTOR_MAX_PROMPT) })).toMatchObject({ op: 'start' })
  })
})

describe('the engine hint', () => {
  it('is optional, rebuilt from its two fields, and anything else is refused', () => {
    const start = cleanStart({ ...base(), spec: { kind: 'cli', cli: 'claude', junk: 1 } })
    expect(start).toMatchObject({ spec: { kind: 'cli', cli: 'claude' } })
    expect(JSON.stringify(start)).not.toContain('junk')
    expect(cleanStart({ ...base(), spec: { kind: 'dsh' } })).toMatchObject({ spec: { kind: 'dsh' } })
    expect(cleanStart(base())).not.toHaveProperty('spec')
    for (const bad of [{ kind: 'x' }, { kind: 'cli', cli: 'bash' }, 'claude', [], null]) expect(cleanStart({ ...base(), spec: bad }), JSON.stringify(bad)).toBe('malformed')
  })
})

describe('cleanOp', () => {
  it('reads the other ops and refuses the malformed', () => {
    expect(cleanOp({ op: 'info', junk: 1 })).toEqual({ op: 'info' })
    expect(cleanOp({ op: 'cancel', turnId: 't1' })).toEqual({ op: 'cancel', turnId: 't1' })
    expect(cleanOp({ op: 'steer', turnId: 't1', requestId: 'r1', text: 'mais curto' })).toEqual({ op: 'steer', turnId: 't1', requestId: 'r1', text: 'mais curto' })
    expect(cleanOp({ op: 'tool', turnId: 't1', callId: 'c1', name: 'post_message', args: { text: 'oi' } })).toEqual({ op: 'tool', turnId: 't1', callId: 'c1', name: 'post_message', args: { text: 'oi' } })
    for (const bad of [null, [], {}, { op: 'hack' }, { op: 'cancel' }, { op: 'steer', turnId: 't', requestId: 'r' }, { op: 'tool', turnId: 't', callId: 'c', name: 'a b', args: {} }, { op: 'tool', turnId: 't', callId: 'c', name: 'ok', args: [] }, { op: 'event', turnId: 't', seq: -1, events: [] }, { op: 'event', turnId: 't', seq: 0, events: 'x' }]) {
      expect(cleanOp(bad), JSON.stringify(bad)).toBe('malformed')
    }
    expect(cleanOp({ op: 'tool', turnId: 't', callId: 'c', name: 'ok', args: { big: 'x'.repeat(300_000) } })).toBe('too-big')
  })

  it('an event batch keeps only events of a known type with a timestamp; an empty batch is the heartbeat; too many or too big is refused', () => {
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: [] })).toEqual({ op: 'event', turnId: 't1', seq: 0, events: [] })
    const batch = cleanOp({ op: 'event', turnId: 't1', seq: 3, events: [{ type: 'delta', at: '2026-11-12T10:00:00.000Z', text: 'oi' }, { type: 'ended', at: '2026-11-12T10:00:01.000Z', report: { state: 'ready', summary: 'feito' } }] })
    expect(batch).toMatchObject({ op: 'event', seq: 3 })
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: [{ type: 'delta', at: 'agora', text: 'oi' }] }), 'a timestamp that is not a date (R1)').toBe('malformed')
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: [{ type: 'exec', at: 'x', cmd: 'rm -rf' }] })).toBe('malformed')
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: [{ type: 'delta', text: 'sem hora' }] })).toBe('malformed')
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: Array.from({ length: EXECUTOR_MAX_EVENTS + 1 }, () => ({ type: 'delta', at: '2026-11-12T10:00:00.000Z', text: 'y' })) })).toBe('too-big')
    expect(cleanOp({ op: 'event', turnId: 't1', seq: 0, events: [{ type: 'delta', at: '2026-11-12T10:00:00.000Z', text: 'y'.repeat(300_000) }] })).toBe('too-big')
  })
})

describe('what A sends and what B starts', () => {
  const handler = vi.fn(() => Promise.resolve({ content: 'ok' }))
  const input = (over: Partial<StartTurnInput> = {}): StartTurnInput => ({
    ticketId: 'tk1', assignmentId: 'as1', personaId: 'nina', cwd: 'C:\\Users\\ana\\projeto', prompt: 'Resuma o dia.', model: 'sonnet', history: [{ role: 'user', text: 'oi' }], effort: 'high', threadKey: 'canal:geral',
    mcpTools: { server: 'persona', instructions: 'Use com cuidado.', tools: [{ name: 'post_message', description: 'Fala no canal.', inputSchema: { type: 'object' }, handler }] }, resumeSessionId: 'sessao-da-A', ...over,
  })

  it('startOf carries the turn and the NAMES and schemas of the tools — never a handler, a working directory or A\'s session', () => {
    const start = startOf(input(), { turnId: 't1', epoch: 4, now: NOW })
    if (typeof start === 'string') throw new Error('refused')
    expect(start).toMatchObject({ op: 'start', turnId: 't1', personaId: 'nina', epoch: 4, prompt: 'Resuma o dia.', model: 'sonnet', effort: 'high', threadKey: 'canal:geral', toolServer: 'persona', notAfter: NOW + EXECUTOR_TURN_TTL_MS })
    expect(start.tools).toEqual([{ name: 'post_message', description: 'Fala no canal.', inputSchema: { type: 'object' } }])
    const wire = JSON.stringify(start)
    expect(wire).not.toContain('projeto')
    expect(wire).not.toContain('sessao-da-A')
    expect(wire).not.toContain('handler')
    expect(cleanStart(JSON.parse(wire))).toEqual(start) // what A sends is what B reads
  })

  it('an image is a path on A and means nothing on B: the turn is refused whole, never started without it', () => {
    expect(startOf(input({ images: [{ path: 'C:\\anexo.png' }] }), { turnId: 't1', epoch: 4, now: NOW })).toBe('images-not-supported')
    expect(startOf(input({ images: [] }), { turnId: 't1', epoch: 4, now: NOW })).toMatchObject({ op: 'start' })
  })

  it('inputOf starts B\'s runner in B\'s scratch folder and serves the tools through the PROXY: a call goes to A, not to a handler of B', async () => {
    const start = startOf(input(), { turnId: 't1', epoch: 4, now: NOW }) as ExecutorStart
    const call = vi.fn((name: string, args: Record<string, unknown>) => Promise.resolve({ content: `A rodou ${name} com ${JSON.stringify(args)}` }))
    const built = inputOf(start, 'C:\\dados\\executor\\abc', call)
    expect(built).toMatchObject({ ticketId: 'tk1', assignmentId: 'as1', personaId: 'nina', cwd: 'C:\\dados\\executor\\abc', prompt: 'Resuma o dia.', model: 'sonnet', threadKey: 'canal:geral', effort: 'high' })
    expect(built.resumeSessionId).toBeUndefined()
    expect(built.images).toBeUndefined()
    expect(built.mcpTools?.server).toBe('persona')
    expect(await built.mcpTools?.tools[0]?.handler({ text: 'oi' })).toEqual({ content: 'A rodou post_message com {"text":"oi"}' })
    expect(call).toHaveBeenCalledWith('post_message', { text: 'oi' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('a turn with no tools starts with none', () => {
    const { mcpTools, ...plain } = input()
    void mcpTools
    const start = startOf(plain, { turnId: 't1', epoch: 4, now: NOW }) as ExecutorStart
    expect(inputOf(start, 'C:\\x', () => Promise.resolve({ content: '' })).mcpTools).toBeUndefined()
  })
})
