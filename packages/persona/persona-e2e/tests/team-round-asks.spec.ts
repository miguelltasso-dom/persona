/**
 * TEAM-10 attempt 3: the harness answers the question cards of the team as the person would (`team-round-asks.ts`). Pure: an injected host call and clock, no app, no model.
 */
import { describe, expect, it } from 'vitest'
import { ASK_ANSWER_TEXT, createAskAnswerer, FOLLOW_UP_MS, MIN_OPEN_MS, type HostCall } from '../src/team-round-asks.ts'

const SCOPE = { workspaceId: 'w', projectId: 'p' }

/** A scripted host: `cards()` is the live list; `answers` is what `answerAttention` returns, in order (`true` = the Task wakes). */
function host(cards: () => unknown, answers: Array<boolean | Error>) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = []
  const call: HostCall = async (method, args) => {
    calls.push({ method, args })
    if (method === 'listPersonaAsks') {
      const value = cards()
      if (value instanceof Error) throw value
      return value
    }
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next ?? true
  }
  return { call, calls, answersCalled: () => calls.filter(item => item.method === 'answerAttention') }
}

const card = (askId: string, patch: Record<string, unknown> = {}): Record<string, unknown> => ({ askId, ticketId: 't1', personaName: 'Téo', question: `Pergunta ${askId}?`, status: 'open', step: { index: 1, total: 2 }, ...patch })

describe('the harness answers the team\'s question cards as the person', () => {
  it('waits like a person who reads (MIN_OPEN_MS), then answers with the FACTS in plain text — not a chip — and says what it answered', async () => {
    let t = 1_000
    const server = host(() => [card('a1')], [true])
    const answerer = createAskAnswerer(server.call, SCOPE, { now: () => t })
    await answerer.poll()
    expect(server.answersCalled(), 'first sight of the card: nobody answers yet').toHaveLength(0)
    expect(answerer.hasOpen(), 'the round must not be called quiet on top of a question').toBe(true)
    t += MIN_OPEN_MS - 1
    await answerer.poll()
    expect(server.answersCalled()).toHaveLength(0)
    t += 1
    await answerer.poll()
    expect(server.answersCalled()).toHaveLength(1)
    expect(server.answersCalled()[0]!.args).toEqual({ ...SCOPE, ticketId: 't1', text: ASK_ANSWER_TEXT })
    expect(server.answersCalled()[0]!.args, 'text alone: no optionIds').not.toHaveProperty('optionIds')
    expect(ASK_ANSWER_TEXT, 'the answer carries the facts of the request').toMatch(/2 por R\$ 9.*sexta a domingo.*WhatsApp/u)
    expect(answerer.answered).toMatchObject([{ askId: 'a1', ticketId: 't1', personaName: 'Téo', question: 'Pergunta a1?', released: true, step: { index: 1, total: 2 } }])
    expect(answerer.stopped).toBeUndefined()
    await answerer.poll()
    expect(server.answersCalled(), 'an answered card is not answered twice').toHaveLength(1)
  })

  it('a sequence "Pergunta i de n": every answer opens the next card (no wait beyond a beat), only the LAST one wakes the Task', async () => {
    let t = 0
    let live = [card('s1', { step: { index: 1, total: 3 } })]
    const server = host(() => live, [false, false, true])
    const answerer = createAskAnswerer(server.call, SCOPE, { now: () => t })
    await answerer.poll()
    t += MIN_OPEN_MS
    await answerer.poll()
    expect(answerer.answered.map(item => item.released)).toEqual([false])
    live = [card('s1', { status: 'answered' }), card('s2', { step: { index: 2, total: 3 } })]
    await answerer.poll() // the next card is seen for the first time
    t += FOLLOW_UP_MS
    await answerer.poll()
    live = [card('s1', { status: 'answered' }), card('s2', { status: 'answered' }), card('s3', { step: { index: 3, total: 3 } })]
    await answerer.poll()
    t += FOLLOW_UP_MS
    await answerer.poll()
    expect(answerer.answered.map(item => [item.askId, item.released])).toEqual([['s1', false], ['s2', false], ['s3', true]])
    live = [card('s1', { status: 'answered' }), card('s2', { status: 'answered' }), card('s3', { status: 'answered' })]
    await answerer.poll()
    expect(answerer.hasOpen()).toBe(false)
  })

  it('ignores cancelled and answered cards, and cards without an id or a Task', async () => {
    let t = 0
    const server = host(() => [card('x1', { status: 'cancelled' }), card('x2', { status: 'answered' }), card('', {}), card('x3', { ticketId: '' })], [])
    const answerer = createAskAnswerer(server.call, SCOPE, { now: () => t })
    await answerer.poll()
    t += 60_000
    await answerer.poll()
    expect(server.answersCalled()).toHaveLength(0)
    expect(answerer.hasOpen()).toBe(false)
  })

  it('answers at most `maxRounds` rounds: a model that asks again is a FINDING, not a loop to feed (and the round is no longer held open for it)', async () => {
    let t = 0
    let live = [card('r1')]
    const server = host(() => live, [true, true])
    const answerer = createAskAnswerer(server.call, SCOPE, { now: () => t, maxRounds: 2 })
    for (const askId of ['r1', 'r2']) {
      live = [card(askId)]
      await answerer.poll()
      t += MIN_OPEN_MS
      await answerer.poll()
    }
    expect(answerer.answered).toHaveLength(2)
    live = [card('r3', { question: 'Qual a cor do cartaz?' })]
    await answerer.poll()
    t += MIN_OPEN_MS
    await answerer.poll()
    expect(server.answersCalled(), 'the 3rd round is not answered').toHaveLength(2)
    expect(answerer.stopped).toMatch(/asked the person again after 2 round\(s\).*Qual a cor do cartaz\?.*a finding about the team/u)
    expect(answerer.hasOpen()).toBe(false)
    await answerer.poll()
    expect(server.calls.filter(item => item.method === 'listPersonaAsks'), 'once stopped it stops looking').toHaveLength(6)
  })

  it('the total of answers is capped, and a host failure stops the answerer instead of throwing', async () => {
    let t = 0
    const capped = host(() => [card(`c${String(t)}`)], [false, false])
    const limited = createAskAnswerer(capped.call, SCOPE, { now: () => t, maxAnswers: 2, followUpMs: 0, minOpenMs: 0 })
    for (let i = 0; i < 4; i += 1) { t += 10; await limited.poll(); await limited.poll() }
    expect(limited.answered).toHaveLength(2)
    expect(limited.stopped).toMatch(/already answered 2 question card/u)

    const unreadable = createAskAnswerer(host(() => new Error('remote not found'), []).call, SCOPE, { now: () => t })
    await expect(unreadable.poll()).resolves.toBeUndefined()
    expect(unreadable.stopped).toMatch(/listPersonaAsks failed \(remote not found\)/u)
    expect(unreadable.hasOpen()).toBe(false)

    const refused = createAskAnswerer(host(() => [card('f1')], [new Error('Essa pergunta já foi respondida.')]).call, SCOPE, { now: () => t, minOpenMs: 0 })
    await refused.poll()
    t += 1
    await expect(refused.poll()).resolves.toBeUndefined()
    expect(refused.answered).toHaveLength(0)
    expect(refused.stopped).toMatch(/answerAttention failed.*Essa pergunta já foi respondida\./u)
  })
})
