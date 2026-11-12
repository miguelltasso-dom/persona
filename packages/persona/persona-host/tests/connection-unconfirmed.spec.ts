import { describe, expect, it } from 'vitest'
import type { ConnectionSnapshot } from '@deepseek-ai/dsh-persona-runners'
import { CheckTracker, UNCONFIRMED_AFTER } from '../src/check-unconfirmed.ts'
import { ConnectionProbe } from '../src/connection-probe.ts'

/**
 * Item 13 (Tally, 11/11), "conferindo" honesto: an engine whose login check ran out of time is NEVER "sem login". Once: "conferindo…". Twice in a row: "não consegui conferir"
 * (`unconfirmed`, with a way to try again). Only an answer from the CLI itself ("not logged in") is a logout. No CLI, no model: the detector is injected.
 */
const logged = (over: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot => ({ id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: ['haiku'], ...over })
const timedOut = (): ConnectionSnapshot => ({ id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [], authUnknown: true })
const loggedOut = (): ConnectionSnapshot => ({ id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [] })

function probeOf(answers: Array<ConnectionSnapshot[] | Error>): ConnectionProbe {
  let at = 0
  return new ConnectionProbe({
    timeoutMs: 8_000, now: () => 0, cacheMs: 0,
    detect: async () => {
      const next = answers[Math.min(at, answers.length - 1)]
      at += 1
      if (next instanceof Error) throw next
      return next ?? []
    },
  })
}
const claudeOf = (cards: readonly { kind: string }[]) => cards.find(card => card.kind === 'claude') as ReturnType<ConnectionProbe['list']>[number] | undefined

describe('CheckTracker', () => {
  it('counts only checks that ran out of time IN A ROW; an answer (logged in or out) clears the count', () => {
    const tracker = new CheckTracker()
    tracker.note('claude', true)
    expect(tracker.isUnconfirmed('claude')).toBe(false)
    tracker.note('claude', true)
    expect(tracker.isUnconfirmed('claude')).toBe(true)
    tracker.note('claude', false)
    expect(tracker.isUnconfirmed('claude')).toBe(false)
    tracker.note('claude', true)
    expect(tracker.isUnconfirmed('claude')).toBe(false) // starts from zero again
    expect(UNCONFIRMED_AFTER).toBe(2)
  })

  it('whole passes that fail count for every engine; one pass that answers clears them; reset() starts over', () => {
    const tracker = new CheckTracker()
    tracker.failPass()
    expect(tracker.passesFailing()).toBe(false)
    tracker.failPass()
    expect(tracker.passesFailing()).toBe(true)
    expect(tracker.isUnconfirmed('codex')).toBe(true)
    tracker.note('codex', false)
    expect(tracker.passesFailing()).toBe(false)
    tracker.failPass(); tracker.failPass()
    tracker.reset()
    expect(tracker.passesFailing()).toBe(false)
  })
})

describe('the connection probe says "não consegui conferir", never "sem login", for a check that ran out of time', () => {
  it('first timeout: still "conferindo" (checking), no error, not yet unconfirmed; second in a row: unconfirmed, still no error and still not logged out', async () => {
    const probe = probeOf([[timedOut()], [timedOut()]])
    const first = claudeOf(await probe.ready())
    expect(first).toMatchObject({ phase: 'checking' })
    expect(first?.error).toBeUndefined()
    expect(first?.unconfirmed).toBeUndefined()
    const second = claudeOf(await probe.ready())
    expect(second).toMatchObject({ phase: 'checking', unconfirmed: true })
    expect(second?.error).toBeUndefined() // never `not_logged_in`
  })

  it('a CLI that really answers "not logged in" is a confirmed logout: error not_logged_in, never "unconfirmed"', async () => {
    const probe = probeOf([[loggedOut()], [loggedOut()], [loggedOut()]])
    for (let pass = 0; pass < 3; pass += 1) await probe.ready()
    const card = claudeOf(probe.list())
    expect(card).toMatchObject({ phase: 'ready', loggedIn: false })
    expect(card?.unconfirmed).toBeUndefined()
  })

  it('a pass that answers clears it: timeout, timeout, logged in = ready and no flag', async () => {
    const probe = probeOf([[timedOut()], [timedOut()], [logged()]])
    await probe.ready()
    expect(claudeOf(await probe.ready())?.unconfirmed).toBe(true)
    const card = claudeOf(await probe.ready())
    expect(card).toMatchObject({ phase: 'ready', loggedIn: true })
    expect(card?.unconfirmed).toBeUndefined()
  })

  it('a detector that throws (the whole pass ran out of time) twice: every engine is "não consegui conferir", none is "sem login"', async () => {
    // Every `list()` of a cold probe starts a new check in the background (the UI polls), so the exact moment of the 2nd failure is not asserted here: that is the CheckTracker test.
    const probe = probeOf([new Error('timeout'), new Error('timeout')])
    await probe.ready()
    await probe.ready()
    const cards = probe.list()
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every(card => card.phase === 'checking' && card.unconfirmed === true && card.error === undefined && card.loggedIn === false)).toBe(true)
  })

  it('"Tentar de novo" (retry) forgets the old timeouts: one more timeout is only "conferindo…" again', async () => {
    const probe = probeOf([[timedOut()], [timedOut()], [timedOut()]])
    await probe.ready()
    expect(claudeOf(await probe.ready())?.unconfirmed).toBe(true)
    const again = claudeOf(await probe.retry())
    expect(again).toMatchObject({ phase: 'checking' })
    expect(again?.unconfirmed).toBeUndefined()
  })
})
