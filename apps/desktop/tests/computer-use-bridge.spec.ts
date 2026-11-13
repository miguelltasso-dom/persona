import { describe, expect, it, vi } from 'vitest'
import { MAX_IN_FLIGHT, PERSONA_COMPUTER_USE_IPC, createComputerUseMainBridge, type MainBridgeDeps } from '../src/computer-use-bridge.ts'

const TAG = PERSONA_COMPUTER_USE_IPC
const target = { windowHandle: '197382', processId: 9000, title: 'Fixture' }
const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 5)) }

function rig(over: Partial<MainBridgeDeps> = {}) {
  const sent: Array<Record<string, unknown>> = []
  let held = false
  const contexts: Array<{ name: string; context: unknown }> = []
  const deps: MainBridgeDeps = {
    observer: { observe: async (context) => { contexts.push({ name: 'observe', context }); return { atMs: 1, captureRef: 'c', tree: { id: 'window', role: 'Window', name: 'w' }, ...(context?.target === undefined ? {} : { target: context.target }) } } },
    actPort: { act: async (action, context) => { contexts.push({ name: 'act', context }); return { ok: true, detail: action.kind } } },
    mcp: {
      held: () => held,
      screenshot: async (context) => { contexts.push({ name: 'screenshot', context }); return 'shot' },
      click: async (x, y, context) => { contexts.push({ name: 'click', context }); return `ok ${String(x)},${String(y)}` },
      type: async (text, context) => { contexts.push({ name: 'type', context }); return `typed ${text}` },
    },
    send: (message) => { sent.push(message as Record<string, unknown>) },
    ...over,
  }
  return { bridge: createComputerUseMainBridge(deps), sent, contexts, hold: (value: boolean) => { held = value } }
}

describe('what the bridge consumes', () => {
  it('only its own messages: anything else is left to DesktopHostProcess (which would kill the child on an unknown one)', () => {
    const f = rig()
    for (const message of [null, undefined, 'x', 42, [], {}, { type: 'ready' }, { type: 'plugin-operation' }, { type: 'persona-computer-useX' }]) expect(f.bridge.handle(message)).toBe(false)
    expect(f.sent).toEqual([])
  })
})

describe('the five operations reach the executor with the host-forwarded context', () => {
  it('observe, act, screenshot, click and type: right call, runId + target + a signal, answer correlated by requestId and carrying held', async () => {
    const f = rig()
    f.hold(true)
    expect(f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1', target })).toBe(true)
    expect(f.bridge.handle({ type: TAG, requestId: 2, op: 'act', runId: 'r1', target, action: { kind: 'click', target: 'Salvar', x: 0, y: 0 } })).toBe(true)
    expect(f.bridge.handle({ type: TAG, requestId: 3, op: 'screenshot', target })).toBe(true)
    expect(f.bridge.handle({ type: TAG, requestId: 4, op: 'click', x: 10, y: 20, target })).toBe(true)
    expect(f.bridge.handle({ type: TAG, requestId: 5, op: 'type', text: 'olá', target })).toBe(true)
    await flush()
    const byId = Object.fromEntries(f.sent.map(message => [message.requestId as number, message]))
    expect(byId[1]).toMatchObject({ op: 'observe', held: true, observation: { captureRef: 'c', target } })
    expect(byId[2]).toMatchObject({ op: 'act', result: { ok: true, detail: 'click' } })
    expect(byId[3]).toMatchObject({ op: 'screenshot', content: 'shot' })
    expect(byId[4]).toMatchObject({ op: 'click', content: 'ok 10,20' })
    expect(byId[5]).toMatchObject({ op: 'type', content: 'typed olá' })
    const first = f.contexts[0]?.context as { runId?: string; target?: unknown; signal?: AbortSignal }
    expect(first.runId).toBe('r1')
    expect(first.target).toEqual(target)
    expect(first.signal).toBeInstanceOf(AbortSignal)
  })

  it('an executor that throws answers `executor-unavailable` (the child fails closed) and frees the slot', async () => {
    const f = rig({ observer: { observe: async () => { throw new Error('boom') } } })
    f.bridge.handle({ type: TAG, requestId: 7, op: 'observe', target })
    await flush()
    expect(f.sent).toEqual([expect.objectContaining({ requestId: 7, op: 'observe', error: 'executor-unavailable' })])
    expect(f.bridge.inFlight()).toBe(0)
  })
})

describe('a hostile or broken request never reaches the executor and never kills anything', () => {
  it.each([
    ['unknown op', { type: TAG, requestId: 1, op: 'format-disk' }],
    ['bad target handle', { type: TAG, requestId: 1, op: 'observe', target: { windowHandle: 'abc', processId: 1 } }],
    ['bad target pid', { type: TAG, requestId: 1, op: 'observe', target: { windowHandle: '5', processId: -3 } }],
    ['target not an object', { type: TAG, requestId: 1, op: 'observe', target: 'x' }],
    ['runId not a string', { type: TAG, requestId: 1, op: 'observe', runId: 7 }],
    ['act without an action', { type: TAG, requestId: 1, op: 'act' }],
    ['act with a bad action', { type: TAG, requestId: 1, op: 'act', action: { kind: 'rm -rf' } }],
    ['click without numbers', { type: TAG, requestId: 1, op: 'click', x: 'a', y: 2 }],
    ['click with Infinity', { type: TAG, requestId: 1, op: 'click', x: Infinity, y: 2 }],
    ['type with a huge text', { type: TAG, requestId: 1, op: 'type', text: 'x'.repeat(10_001) }],
    ['type without text', { type: TAG, requestId: 1, op: 'type' }],
  ])('%s is refused with bad-request', async (_name, message) => {
    const f = rig()
    expect(f.bridge.handle(message)).toBe(true)
    await flush()
    expect(f.contexts).toEqual([])
    expect(f.sent).toEqual([expect.objectContaining({ requestId: 1, error: 'bad-request' })])
  })

  it('a request without a valid requestId is consumed and dropped (nothing to answer, nothing run)', async () => {
    const f = rig()
    for (const requestId of [undefined, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 2]) expect(f.bridge.handle({ type: TAG, requestId, op: 'observe' })).toBe(true)
    await flush()
    expect(f.sent).toEqual([])
    expect(f.contexts).toEqual([])
  })

  it('a requestId already in flight is refused, and no more than the limit run at once', async () => {
    const release: Array<() => void> = []
    const slow = rig({ observer: { observe: () => new Promise((resolve) => { release.push(() => { resolve({ atMs: 1, captureRef: 'c', tree: { id: 'w', role: 'Window', name: '' } }) }) }) } })
    slow.bridge.handle({ type: TAG, requestId: 1, op: 'observe' })
    slow.bridge.handle({ type: TAG, requestId: 1, op: 'observe' })
    expect(slow.sent).toEqual([expect.objectContaining({ requestId: 1, error: 'bad-request' })])
    for (let id = 2; id <= MAX_IN_FLIGHT; id += 1) slow.bridge.handle({ type: TAG, requestId: id, op: 'observe' })
    slow.bridge.handle({ type: TAG, requestId: 100, op: 'observe' })
    expect(slow.sent.at(-1)).toMatchObject({ requestId: 100, error: 'busy' })
    release.forEach((fn) => { fn() })
  })
})

describe('stop is synchronous and silent', () => {
  it('aborts the call by requestId and by runId, and the aborted call never answers', async () => {
    const aborted: string[] = []
    const slow = rig({
      observer: {
        observe: context => new Promise((_resolve, reject) => {
          context?.signal?.addEventListener('abort', () => { aborted.push(context.runId ?? '?'); reject(new Error('aborted')) })
        }),
      },
    })
    slow.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1' })
    slow.bridge.handle({ type: TAG, requestId: 2, op: 'observe', runId: 'r2' })
    expect(slow.bridge.inFlight()).toBe(2)
    expect(slow.bridge.handle({ type: TAG, op: 'stop', requestId: 1 })).toBe(true)
    expect(aborted).toEqual(['r1'])
    expect(slow.bridge.handle({ type: TAG, op: 'stop', runId: 'r2' })).toBe(true)
    expect(aborted).toEqual(['r1', 'r2'])
    await flush()
    expect(slow.sent).toEqual([])
    expect(slow.bridge.inFlight()).toBe(0)
  })

  it('a stop for something unknown is harmless, and abortAll (the host went away) stops everything', async () => {
    const aborted: number[] = []
    const slow = rig({
      observer: {
        observe: context => new Promise((_resolve, reject) => {
          context?.signal?.addEventListener('abort', () => { aborted.push(1); reject(new Error('aborted')) })
        }),
      },
    })
    expect(slow.bridge.handle({ type: TAG, op: 'stop', runId: 'nobody' })).toBe(true)
    slow.bridge.handle({ type: TAG, requestId: 1, op: 'observe' })
    slow.bridge.handle({ type: TAG, requestId: 2, op: 'observe' })
    slow.bridge.abortAll()
    expect(aborted).toHaveLength(2)
  })
})

describe('the overlay lifecycle: opens with the first call of a run, closes when the runs have been idle', () => {
  it('begin fires once per run (not per call), and idle fires after the idle time with nothing in flight', async () => {
    vi.useFakeTimers()
    try {
      const begin = vi.fn()
      const idle = vi.fn()
      const f = rig({ begin, idle, idleMs: 1000 })
      f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1', target })
      f.bridge.handle({ type: TAG, requestId: 2, op: 'screenshot', runId: 'r1', target })
      f.bridge.handle({ type: TAG, requestId: 3, op: 'observe', runId: 'r2', target })
      await vi.advanceTimersByTimeAsync(10)
      expect(begin.mock.calls).toEqual([['r1', undefined], ['r2', undefined]])
      expect(idle).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(980) // 990 ms since the last call finished
      expect(idle).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(30) // 1020 ms
      expect(idle).toHaveBeenCalledOnce()
      // a new run after idle begins again
      f.bridge.handle({ type: TAG, requestId: 4, op: 'observe', runId: 'r1', target })
      await vi.advanceTimersByTimeAsync(10)
      expect(begin).toHaveBeenCalledTimes(3)
    } finally { vi.useRealTimers() }
  })

  it('a new call cancels the idle timer, and abortAll (the host went away) closes everything at once', async () => {
    vi.useFakeTimers()
    try {
      const idle = vi.fn()
      const f = rig({ idle, idleMs: 1000 })
      f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1', target })
      await vi.advanceTimersByTimeAsync(900)
      f.bridge.handle({ type: TAG, requestId: 2, op: 'observe', runId: 'r1', target })
      await vi.advanceTimersByTimeAsync(900)
      expect(idle).not.toHaveBeenCalled()
      f.bridge.abortAll()
      expect(idle).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('the persona travels with the run: begin gets personaId, the executor context carries it, and a bad one is refused', async () => {
    const begin = vi.fn()
    const f = rig({ begin })
    f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1', personaId: 'bia', target })
    f.bridge.handle({ type: TAG, requestId: 2, op: 'observe', runId: 'r1', personaId: 'bia', target })
    f.bridge.handle({ type: TAG, requestId: 3, op: 'observe', runId: 'r1', personaId: 7, target })
    f.bridge.handle({ type: TAG, requestId: 4, op: 'observe', runId: 'r1', personaId: 'x'.repeat(257), target })
    await flush()
    expect(begin.mock.calls).toEqual([['r1', 'bia']])
    expect((f.contexts[0]?.context as { personaId?: string }).personaId).toBe('bia')
    expect(f.sent.filter(message => message.error === 'bad-request').map(message => message.requestId)).toEqual([3, 4])
  })

  it('the host ending a run (op end) closes the overlay at once when it was the last one; no reply; an unknown run changes nothing', async () => {
    const idle = vi.fn()
    const f = rig({ idle })
    f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', runId: 'r1', target })
    f.bridge.handle({ type: TAG, requestId: 2, op: 'observe', runId: 'r2', target })
    await flush()
    const replies = f.sent.length
    expect(f.bridge.handle({ type: TAG, op: 'end', runId: 'nobody' })).toBe(true)
    expect(f.bridge.handle({ type: TAG, op: 'end', runId: 'r1' })).toBe(true)
    expect(idle).not.toHaveBeenCalled() // r2 is still open
    expect(f.bridge.handle({ type: TAG, op: 'end', runId: 'r2' })).toBe(true)
    expect(idle).toHaveBeenCalledOnce()
    expect(f.sent).toHaveLength(replies)
  })

  it('a call without a runId never begins anything', async () => {
    const begin = vi.fn()
    const f = rig({ begin })
    f.bridge.handle({ type: TAG, requestId: 1, op: 'observe', target })
    await flush()
    expect(begin).not.toHaveBeenCalled()
  })
})

describe('the human takeover is pushed, once per change', () => {
  it('notifyHeld sends the held event and does not repeat an unchanged value', () => {
    const f = rig()
    f.bridge.notifyHeld(true)
    f.bridge.notifyHeld(true)
    f.bridge.notifyHeld(false)
    expect(f.sent).toEqual([{ type: TAG, op: 'held', held: true }, { type: TAG, op: 'held', held: false }])
  })

  it('a reply carries the CURRENT hold at the moment it is sent', async () => {
    const send = vi.fn()
    const f = rig({ send })
    f.bridge.handle({ type: TAG, requestId: 1, op: 'screenshot', target })
    f.hold(true)
    await flush()
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ requestId: 1, held: true }))
  })
})
