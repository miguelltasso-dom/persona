import { describe, expect, it } from 'vitest'
import type { RunEvent, StartTurnInput, TurnToolSet } from '@deepseek-ai/dsh-persona-runners'
import { RemoteTurnError, RemoteTurns, type RemoteHome, type RemoteTurnsDeps } from '../src/computers/remote-turns.ts'
import type { ExecutorOp, ExecutorStart } from '../src/computers/executor-protocol.ts'
import { COMPUTER_BODY_MAX } from '../src/computers/computer-link.ts'

/**
 * D-116 executor, Lumen's review of 12/11 (R4, R5, (b) and the aligned ceilings), proved against the real RemoteTurns (pure, no host).
 * R1-R3 live in `.maestri/tmp/lumen/marco/tests/executor-review.spec.ts`.
 */
const A = 'comp-a'
const B = 'comp-b'
const at = '2026-11-12T10:00:00.000Z'
const input: StartTurnInput = { ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: 'C:/A/rascunho', prompt: 'oi', model: 'm' }

interface Rig { readonly turns: RemoteTurns; readonly sent: ExecutorOp[]; readonly release: () => void; readonly tools: TurnToolSet }

/** A whose tool handler hangs until `release()` (so a timed-out call is still running underneath). */
function rig(extra: Partial<RemoteTurnsDeps> = {}, home: RemoteHome = { computerId: B, epoch: 1, state: 'active' }): Rig {
  const sent: ExecutorOp[] = []
  let release = (): void => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const turns = new RemoteTurns({
    selfId: A, homeOf: () => home, isOnline: () => true,
    send: (_to, op) => { sent.push(op); return Promise.resolve({ status: 202, json: { ok: true } }) },
    ...extra,
  })
  const tools = { tools: [{ name: 'persona_report', description: 'x', inputSchema: {}, handler: async () => { await gate; return { content: 'ok' } } }] } as unknown as TurnToolSet
  return { turns, sent, release, tools }
}

const call = (turnId: string, n: number): ExecutorOp => ({ op: 'tool', turnId, callId: `${turnId}-${String(n)}`, name: 'persona_report', args: {} })

describe('R4. a tool that outlives its timeout still holds its slot', () => {
  it('eight calls that time out but whose handlers still run keep the turn at its cap: the ninth is `busy`', async () => {
    const { turns, tools, release } = rig({ toolTimeoutMs: 20 })
    const handle = await turns.startTurn({ ...input, mcpTools: tools })
    const first = await Promise.all(Array.from({ length: 8 }, (_, n) => turns.handle(B, call(handle.runId, n))))
    expect(first.every(answer => answer.status === 200), 'the timed-out calls answer an error result').toBe(true)
    const ninth = await turns.handle(B, call(handle.runId, 99))
    expect(ninth.status, 'eight handlers are still running underneath').toBe(429)
    release()
  })

  it('the slot comes back once the handler really ends', async () => {
    const { turns, tools, release } = rig({ toolTimeoutMs: 20 })
    const handle = await turns.startTurn({ ...input, mcpTools: tools })
    await Promise.all(Array.from({ length: 8 }, (_, n) => turns.handle(B, call(handle.runId, n))))
    release()
    await new Promise<void>((resolve) => { setTimeout(resolve, 30) })
    expect((await turns.handle(B, call(handle.runId, 100))).status).toBe(200)
  })

  it('there is also a cap per COMPUTER (turns x 8 is not the budget): sixteen running calls of one home, then `busy`', async () => {
    const { turns, tools, release } = rig()
    const handles = [await turns.startTurn({ ...input, ticketId: 't1', mcpTools: tools }), await turns.startTurn({ ...input, ticketId: 't2', mcpTools: tools }), await turns.startTurn({ ...input, ticketId: 't3', mcpTools: tools })]
    const answers: Promise<{ status: number }>[] = []
    const statuses: number[] = []
    for (let n = 0; n < 6; n += 1) for (const handle of handles) answers.push(turns.handle(B, call(handle.runId, n)).then((result) => { statuses.push(result.status); return result }))
    await new Promise<void>((resolve) => { setTimeout(resolve, 50) }) // the running ones hang on the gate: only the refused ones have answered
    const busy = statuses.filter(status => status === 429).length
    release()
    await Promise.all(answers)
    expect(busy, 'the 17th and 18th running calls of the same computer are refused').toBe(2)
  })
})

describe('R5. what B spends is B\'s: it never lands on A\'s official book', () => {
  it('the runner for B says where its usage comes from, and the number the orchestration reads (`usage`) is zero whatever B reported', async () => {
    const { turns, tools } = rig()
    const handle = await turns.startTurn({ ...input, mcpTools: tools })
    await turns.handle(B, { op: 'event', turnId: handle.runId, seq: 0, events: [{ type: 'usage', at, usage: { inputTokens: 5000, outputTokens: 700 } } as RunEvent] })
    const runner = turns.runnerFor('nina')
    expect(runner.origin).toBe(`remote:${B}`)
    const asked = runner.usage as unknown as (what: unknown) => Promise<unknown> // the orchestration asks with a session id (a string); a handle must not make a difference either
    expect(await asked.call(runner, handle)).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(await asked.call(runner, 't1')).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('what B reported stays readable apart, with a ceiling, for the screen that shows "ran on another computer"', async () => {
    const { turns, tools } = rig()
    const handle = await turns.startTurn({ ...input, mcpTools: tools })
    await turns.handle(B, { op: 'event', turnId: handle.runId, seq: 0, events: [{ type: 'usage', at, usage: { inputTokens: 5000, outputTokens: 700 } } as RunEvent] })
    expect(turns.runnerFor('nina').remoteUsage(handle)).toEqual({ inputTokens: 5000, outputTokens: 700 })
    await turns.handle(B, { op: 'event', turnId: handle.runId, seq: 1, events: [{ type: 'usage', at, usage: { inputTokens: 9e15, outputTokens: 1 } } as RunEvent] })
    expect(turns.runnerFor('nina').remoteUsage(handle).inputTokens, 'a lying B cannot make a huge number').toBeLessThanOrEqual(1_000_000_000)
  })
})

describe('(b) the home is checked AT START, not only when the persona was taken there', () => {
  it('a home whose certificate is no longer trusted (not in the fresh roster with `mayHost`, or the creator\'s grant is gone) is `home-not-trusted` and nothing is sent', async () => {
    const asked: string[] = []
    const { turns, sent, tools } = rig({ mayHost: (computerId, personaId) => { asked.push(`${computerId}/${personaId}`); return false } })
    await expect(turns.startTurn({ ...input, mcpTools: tools })).rejects.toMatchObject({ code: 'home-not-trusted' })
    expect(asked).toEqual([`${B}/nina`])
    expect(sent, 'no prompt left this computer').toEqual([])
  })

  it('a trusted home starts as before; with no check given nothing changes', async () => {
    const trusted = rig({ mayHost: () => true })
    expect((await trusted.turns.startTurn({ ...input, mcpTools: trusted.tools })).personaId).toBe('nina')
    const plain = rig()
    expect((await plain.turns.startTurn({ ...input, mcpTools: plain.tools })).personaId).toBe('nina')
    expect(RemoteTurnError.name).toBe('RemoteTurnError')
  })
})

describe('the ceilings agree: a start A builds always fits the door', () => {
  it('a long history is trimmed from the OLDEST turn until the whole start fits under the door\'s body limit', async () => {
    const { turns, sent, tools } = rig()
    const history = Array.from({ length: 200 }, (_, n) => ({ role: n % 2 === 0 ? 'user' as const : 'assistant' as const, text: `${String(n).padStart(3, '0')}|${'x'.repeat(99_990)}` }))
    await turns.startTurn({ ...input, history, mcpTools: tools })
    const start = sent[0] as ExecutorStart
    expect(Buffer.byteLength(JSON.stringify(start), 'utf8'), 'under what the gate reads').toBeLessThan(COMPUTER_BODY_MAX)
    const kept = start.history ?? []
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(200)
    expect(kept.at(-1)?.text.startsWith('199|'), 'the newest turn is kept').toBe(true)
    expect(kept[0]?.text.startsWith(String(200 - kept.length).padStart(3, '0')), 'what is dropped is the oldest, in order').toBe(true)
  })

  it('a history that already fits goes whole', async () => {
    const { turns, sent, tools } = rig()
    const history = [{ role: 'user' as const, text: 'oi' }, { role: 'assistant' as const, text: 'ola' }]
    await turns.startTurn({ ...input, history, mcpTools: tools })
    expect((sent[0] as ExecutorStart).history).toEqual(history)
  })
})
