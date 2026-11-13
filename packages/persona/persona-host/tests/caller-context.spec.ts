import { AsyncResource } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  CallerRefused, assertMachineOwner, bindIterable, bindListener, currentCaller, resolveMember, runAs, runAsHost, type Caller,
} from '../src/remote-web/caller-context.ts'

/**
 * M5 (Lumen P0/P1): the identity of a call is per call, set in ONE place, kept across every await / timer / stream pull, and "no ambient identity = refused": a call that loses it is `caller-lost`, never
 * promoted to the owner. The owner and the host are EXPLICIT callers.
 */
const OWNER: Caller = { kind: 'owner' }
const PHONE: Caller = { kind: 'paired', memberId: 'm-ana', deviceId: 'dev-1' }
const live = (): boolean => true
/** What the host says its own session member is (the owner's). */
const HOST_MEMBER = 'm-owner'
const who = (): string | undefined => resolveMember({ isLive: live, host: HOST_MEMBER })
const tick = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })
const reason = (run: () => unknown): string => { try { run(); return 'answered' } catch (error) { return error instanceof CallerRefused ? error.why : 'other' } }

describe('caller-identity-isolated (two calls at the same time, interleaved by await)', () => {
  it('the owner and a phone calling concurrently each keep their own member across awaits, timers and microtasks', async () => {
    const seen: string[] = []
    const call = (caller: Caller, expected: string, steps: number): Promise<void> => runAs(caller, async () => {
      for (let step = 0; step < steps; step += 1) {
        await tick(step % 3)
        await Promise.resolve()
        await new Promise<void>((resolve) => { setImmediate(resolve) })
        seen.push(`${expected}=${who() ?? '?'}`)
      }
    })
    await Promise.all([call(OWNER, HOST_MEMBER, 6), call(PHONE, 'm-ana', 6), call(OWNER, HOST_MEMBER, 4), call(PHONE, 'm-ana', 5)])
    expect(seen.length).toBe(21)
    for (const line of seen) { const [expected, got] = line.split('='); expect(got, line).toBe(expected) }
    expect(currentCaller()).toBeUndefined() // nothing leaks out of the calls
  })

  it('200 interleaved calls, random delays: nobody ever reads the other\'s identity', async () => {
    let wrong = 0
    await Promise.all(Array.from({ length: 200 }, (_, index) => {
      const owner = index % 2 === 0
      return runAs(owner ? OWNER : PHONE, async () => {
        await tick(index % 5)
        await Promise.resolve()
        if (who() !== (owner ? HOST_MEMBER : 'm-ana')) wrong += 1
        await tick((index * 7) % 4)
        if (who() !== (owner ? HOST_MEMBER : 'm-ana')) wrong += 1
      })
    }))
    expect(wrong).toBe(0)
  })
})

describe('caller-identity-survives-stream (the pulls of a Remote stream, and the events other calls emit)', () => {
  async function* follow(log: (member: string | undefined) => void): AsyncGenerator<number> {
    for (let item = 0; item < 3; item += 1) {
      await tick(2)
      log(currentCaller()?.kind)
      yield item
      await Promise.resolve()
      log(currentCaller()?.kind)
    }
  }
  const kindsSeen = (seen: (string | undefined)[]): boolean => seen.length > 0 && seen.every(kind => kind === 'paired')

  it('bound: every pull of the stream runs as the phone, though the Gateway pulls it from OUTSIDE any call', async () => {
    const seen: (string | undefined)[] = []
    const stream = runAs(PHONE, () => bindIterable(PHONE, { [Symbol.asyncIterator]: () => follow(kind => seen.push(kind)) }))
    const items: number[] = []
    for await (const item of stream) items.push(item) // the "Gateway": no caller here
    expect(items).toEqual([0, 1, 2])
    expect(kindsSeen(seen)).toBe(true)
  })

  it('bound: the stream stays the phone even when ANOTHER call (the owner) is the one running when it is pulled', async () => {
    const seen: (string | undefined)[] = []
    const stream = bindIterable(PHONE, { [Symbol.asyncIterator]: () => follow(kind => seen.push(kind)) })
    const iterator = stream[Symbol.asyncIterator]()
    await runAs(OWNER, async () => { await iterator.next() })
    await runAs(OWNER, async () => { await iterator.next() })
    expect(kindsSeen(seen)).toBe(true)
  })

  it('control: WITHOUT the binding a stream pulled from outside has no caller (why the funnel wraps every stream)', async () => {
    const seen: (string | undefined)[] = []
    const stream = runAs(PHONE, () => ({ [Symbol.asyncIterator]: () => follow(kind => seen.push(kind)) }))
    for await (const item of stream) void item
    expect(seen.every(kind => kind === undefined)).toBe(true)
  })

  it('a listener registered DURING a phone call and fired by an event of the OWNER\'s call still runs as the phone', () => {
    const emitter = new EventEmitter()
    const bound: (string | undefined)[] = []
    const unbound: (string | undefined)[] = []
    runAs(PHONE, () => {
      emitter.on('message', bindListener(() => { bound.push(currentCaller()?.kind) }))
      emitter.on('message', () => { unbound.push(currentCaller()?.kind) })
    })
    runAs(OWNER, () => { emitter.emit('message') })
    expect(bound).toEqual(['paired'])
    expect(unbound).toEqual(['owner']) // the hazard the binding removes: the emitter's context, not the subscriber's
  })

  it('return() and throw() of a bound stream reach the source as the same caller (a closed stream cleans up as the phone)', async () => {
    const seen: (string | undefined)[] = []
    async function* source(): AsyncGenerator<number> {
      try { yield 1; yield 2 } finally { seen.push(currentCaller()?.kind) }
    }
    const iterator = bindIterable(PHONE, { [Symbol.asyncIterator]: () => source() })[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.return?.()
    expect(seen).toEqual(['paired'])
  })
})

describe('resolve-member-lost-context-refused / paired-without-context-refused (fail CLOSED: no ambient identity = refused)', () => {
  it('with NO caller at all (a lost context) the member is never the owner\'s: it is refused', () => {
    expect(reason(() => who())).toBe('caller-lost')
    expect(() => who()).toThrow(CallerRefused)
  })

  it('the owner and the host are EXPLICIT: they resolve to the host\'s own session member', () => {
    expect(runAs(OWNER, () => who())).toBe(HOST_MEMBER)
    expect(runAsHost(() => who())).toBe(HOST_MEMBER)
    expect(runAs(OWNER, () => resolveMember({ isLive: live, host: undefined }))).toBeUndefined() // a host with no session member says so, it is not an error
  })

  it('a context broken ON PURPOSE inside a phone call is refused (and the real context is intact)', async () => {
    const outside = new AsyncResource('outside') // created with no caller
    await runAs(PHONE, async () => {
      await Promise.resolve()
      expect(outside.runInAsyncScope(() => reason(() => who()))).toBe('caller-lost')
      expect(who()).toBe('m-ana')
    })
  })

  it('a paired device that is no longer live is refused, with the context intact', async () => {
    await runAs(PHONE, async () => {
      await tick(1)
      expect(() => resolveMember({ isLive: () => false, host: HOST_MEMBER })).toThrow(/device-not-live/u)
      expect(resolveMember({ isLive: id => id === 'dev-1', host: HOST_MEMBER })).toBe('m-ana')
    })
  })

  it('runAsHost is an explicit label for the host\'s own work and nothing more: it does not leak out', async () => {
    await runAsHost(async () => { await tick(1); expect(currentCaller()).toEqual({ kind: 'host' }) })
    expect(currentCaller()).toBeUndefined()
  })
})

describe('assert-machine-owner-fails-closed-without-context (the PC-only Remotes, defence in depth)', () => {
  it('a paired caller never passes (pc-only), even after awaits; a call that lost its context never passes either (caller-lost)', async () => {
    expect(reason(() => { runAs(PHONE, () => { assertMachineOwner() }) })).toBe('pc-only')
    await runAs(PHONE, async () => {
      await tick(2)
      await Promise.resolve()
      expect(reason(() => { assertMachineOwner() })).toBe('pc-only')
    })
    expect(reason(() => { assertMachineOwner() })).toBe('caller-lost') // no context at all
    const outside = new AsyncResource('outside')
    await runAs(PHONE, async () => {
      await Promise.resolve()
      expect(outside.runInAsyncScope(() => reason(() => { assertMachineOwner() }))).toBe('caller-lost')
    })
  })

  it('only the EXPLICIT owner (or the host itself) passes', () => {
    expect(() => { runAs(OWNER, () => { assertMachineOwner() }) }).not.toThrow()
    expect(() => { runAsHost(() => { assertMachineOwner() }) }).not.toThrow()
  })
})
