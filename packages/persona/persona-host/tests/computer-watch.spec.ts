import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LatestSlot, WATCH_MAX_BYTES, WATCH_RECHECK_MS, watchRun, type Capture, type WatchItem, type WatchOptions } from '../src/remote-web/computer-watch.ts'

/**
 * M9 / D-117: the live view of a persona on the PC, as rules: the latest frame wins, at most 2 a second and 150 KB a frame, never unmasked, `janela-coberta` with no picture, and who may watch is asked again every
 * second (fail closed). Fake timers drive the clock.
 */
const frame = (over: Partial<Capture> = {}): Capture => ({ jpeg: new Uint8Array(1_000), w: 640, h: 400, cursor: { x: 0.5, y: 0.25 }, step: 3, of: 12, masked: true, covered: false, ...over })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function start(over: Partial<WatchOptions> = {}): { slot: LatestSlot<Capture>; items: WatchItem[]; ended: { done: boolean }; ends: { count: number }; flags: { canWatch: boolean } } {
  const slot = new LatestSlot<Capture>()
  const items: WatchItem[] = []
  const ended = { done: false }
  const ends = { count: 0 }
  const flags = { canWatch: true }
  void (async () => {
    for await (const item of watchRun({ runId: 'run-1', slot, canWatch: () => flags.canWatch, onEnd: () => { ends.count += 1 }, ...over })) items.push(item)
    ended.done = true
  })()
  return { slot, items, ended, ends, flags }
}
const settle = async (ms = 0): Promise<void> => { await vi.advanceTimersByTimeAsync(ms) }

describe('LatestSlot (the newest frame wins)', () => {
  it('a slow watcher gets only the NEWEST frame: ten put while nobody took are one', async () => {
    const slot = new LatestSlot<number>()
    for (let value = 1; value <= 10; value += 1) slot.put(value)
    expect(await slot.take(100)).toBe(10)
    const waiting = slot.take(1_000) // nothing newer: it waits
    slot.put(11)
    expect(await waiting).toBe(11)
  })

  it('take() times out with no frame, never loses a frame delivered later, and a closed slot answers undefined', async () => {
    const slot = new LatestSlot<number>()
    const first = slot.take(50)
    await vi.advanceTimersByTimeAsync(60)
    expect(typeof (await first)).toBe('symbol') // the timeout marker
    slot.put(1) // arrives after the timeout: it waits in the slot, not in a dead waiter
    expect(await slot.take(50)).toBe(1)
    slot.close()
    expect(await slot.take(50)).toBeUndefined()
    slot.put(2) // nothing after close
    expect(await slot.take(50)).toBeUndefined()
  })
})

describe('what goes out', () => {
  it('a frame carries only the allow-listed fields: the picture, its size, the cursor, the step and the state — never the window title', async () => {
    const { slot, items } = start()
    slot.put(frame({ title: 'Conta do banco — Chrome', paused: 'humano' }))
    await settle()
    expect(items).toHaveLength(1)
    const item = items[0]
    if (item?.type !== 'frame') throw new Error('not a frame')
    expect(Object.keys(item).sort()).toEqual(['at', 'cursor', 'h', 'jpeg', 'of', 'paused', 'runId', 'seq', 'step', 'type', 'w'])
    expect(JSON.stringify(item.cursor)).toBe('{"x":0.5,"y":0.25}')
    expect(item.runId).toBe('run-1')
    expect(JSON.stringify(item)).not.toContain('banco')
  })

  it('an UNMASKED picture never leaves the PC (the producer must say the password fields are covered)', async () => {
    const { slot, items } = start()
    slot.put(frame({ masked: false }))
    await settle()
    expect(items).toEqual([])
    slot.put(frame())
    await settle()
    expect(items).toHaveLength(1)
  })

  it('at most 2 frames a second, the others are dropped (not queued)', async () => {
    const { slot, items } = start()
    for (let index = 0; index < 20; index += 1) { slot.put(frame({ step: index })); await settle(100) } // 10 frames a second offered, for 2 seconds
    const sent = items.filter(item => item.type === 'frame')
    expect(sent.length).toBeGreaterThanOrEqual(3)
    expect(sent.length).toBeLessThanOrEqual(5) // about 2 a second
    for (let index = 1; index < sent.length; index += 1) {
      const before = sent[index - 1]
      const now = sent[index]
      if (before?.type === 'frame' && now?.type === 'frame') expect(now.at - before.at).toBeGreaterThanOrEqual(500)
    }
    const seqs = sent.map(item => (item.type === 'frame' ? item.seq : 0))
    expect(seqs).toEqual(seqs.map((_, index) => index + 1)) // consecutive
  })

  it('a frame over 150 KB is asked to shrink (a few times) and goes out when it fits; if it never fits it is dropped', async () => {
    const attempts: number[] = []
    const { slot, items } = start({ shrink: (_capture, attempt) => { attempts.push(attempt); return new Uint8Array(attempt === 2 ? 100_000 : WATCH_MAX_BYTES + 5) } })
    slot.put(frame({ jpeg: new Uint8Array(WATCH_MAX_BYTES + 1) }))
    await settle()
    expect(attempts).toEqual([1, 2]) // stopped asking once it fit
    expect(items).toHaveLength(1)
    const never = start({ shrink: () => new Uint8Array(WATCH_MAX_BYTES + 5) })
    never.slot.put(frame({ jpeg: new Uint8Array(WATCH_MAX_BYTES + 1) }))
    await settle()
    expect(never.items).toEqual([]) // three tries, still too big: dropped, never sent
    const noShrink = start()
    noShrink.slot.put(frame({ jpeg: new Uint8Array(WATCH_MAX_BYTES + 1) }))
    await settle()
    expect(noShrink.items).toEqual([])
  })
})

describe('another window in front (janela-coberta)', () => {
  it('says the state ONCE and sends NO picture while it lasts; pictures come back when the persona\'s window does', async () => {
    const { slot, items } = start()
    slot.put(frame({ covered: true, jpeg: new Uint8Array(5_000) }))
    await settle()
    slot.put(frame({ covered: true }))
    await settle(600)
    expect(items).toEqual([{ type: 'state', status: 'janela-coberta' }]) // once, no frame of the other window
    slot.put(frame())
    await settle(600)
    expect(items.map(item => item.type)).toEqual(['state', 'frame'])
    slot.put(frame({ covered: true }))
    await settle(600)
    expect(items.map(item => (item.type === 'state' ? item.status : 'frame'))).toEqual(['janela-coberta', 'frame', 'janela-coberta']) // and again when it is covered again
  })
})

describe('who may watch is asked again every second (fail closed)', () => {
  it('without access at the start: "sem-acesso" and the stream ends before any frame', async () => {
    const { slot, items, ended, flags } = (() => { const made = start({ canWatch: () => false }); return made })()
    void flags
    slot.put(frame())
    await settle()
    expect(items).toEqual([{ type: 'state', status: 'sem-acesso' }])
    expect(ended.done).toBe(true)
  })

  it('access lost mid-stream (device revoked, permission off, no longer in the list): the stream ends within a second even with NO new frame', async () => {
    const { slot, items, ended, flags } = start()
    slot.put(frame())
    await settle()
    expect(items).toHaveLength(1)
    flags.canWatch = false
    await settle(WATCH_RECHECK_MS + 50) // nothing arrives from the producer: the recheck still runs
    expect(items.at(-1)).toEqual({ type: 'state', status: 'sem-acesso' })
    expect(ended.done).toBe(true)
  })

  it('access lost when a frame arrives: that frame is NOT sent', async () => {
    const { slot, items, flags } = start()
    flags.canWatch = false
    slot.put(frame())
    await settle()
    expect(items.some(item => item.type === 'frame')).toBe(false)
  })
})

describe('ending', () => {
  it('the run ends (the slot closes): "terminou", and the producer is told to stop capturing', async () => {
    const { slot, items, ended, ends } = start()
    slot.put(frame())
    await settle()
    slot.close()
    await settle()
    expect(items.at(-1)).toEqual({ type: 'state', status: 'terminou' })
    expect(ended.done).toBe(true)
    expect(ends.count).toBe(1)
  })

  it('the watcher goes away (the stream is closed from outside): the producer is told to stop, once', async () => {
    const slot = new LatestSlot<Capture>()
    let ends = 0
    const stream = watchRun({ runId: 'r', slot, canWatch: () => true, onEnd: () => { ends += 1 } })
    const first = stream.next()
    slot.put(frame())
    await settle()
    await first
    await stream.return(undefined)
    expect(ends).toBe(1)
  })
})
