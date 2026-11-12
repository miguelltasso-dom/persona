import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { isDue, lastDailySlot } from '../src/indicators.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/** "Seus números" (colheita item 19a): the offer read from a persona's message, the mandatory test, the quiet refresh, the alert. */

const CLOCK = '2026-11-12T11:00:00.000Z'
const marker = (row: Record<string, unknown>): string => `Vendemos bem ontem.\n[[indicador: ${JSON.stringify(row)}]]`
const SALES = { tipo: 'numero', nome: 'Vendas de ontem', valor: 'R$ 1.240', bruto: 1240, tendencia: '+12% desde ontem', direcao: 'sobe', bomQuando: 'sobe' }

interface Ctx { h: PersonaHost; asked: string[]; answers: Array<string | Error>; clock: { now: string } }

function setup(): Ctx {
  const h = openJourney(CLOCK)
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Vendas' },
  ])
  const ctx: Ctx = { h, asked: [], answers: [], clock: { now: CLOCK } }
  h.orchestration.now = () => ctx.clock.now
  // The quiet turn is the host's `answerAside`: a scripted answerer here (0 AI), and a record of what it was asked.
  const scripted = (_projectId: string, _personaId: string, _askId: string, question: string): Promise<string> => {
    ctx.asked.push(question)
    const next = ctx.answers.shift()
    if (next === undefined) return Promise.reject(new Error('sem resposta combinada'))
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
  Object.assign(h.orchestration, { asideBlocked: () => undefined, answerAside: scripted, answerIndicator: scripted }) // the numbers run on `answerIndicator` (P0-07b)
  const put = (id: string, actorId: string, body: string): void => {
    h.events.append({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body, actorId, subjectId: '', occurredAt: CLOCK })
  }
  put('m-ask', 'ana', 'quanto vendemos ontem?')
  put('m-num', 'nina', marker(SALES))
  return ctx
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

async function fault(run: () => unknown): Promise<RemoteFault> {
  try {
    await run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

async function pinned(ctx: Ctx, extra: { alertDropPct?: number; schedule?: 'hourly' | 'daily' } = {}) {
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 1.300', bruto: 1300 }))
  const test = await ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' })
  return ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'Vendas de ontem', schedule: extra.schedule ?? 'daily', ...(extra.alertDropPct === undefined ? {} : { alertDropPct: extra.alertDropPct }) })
}

it('a persona message with a number shows its words WITHOUT the marker and carries the offer; the same line from the person is plain text', () => {
  const { h } = setup()
  const row = geral(h).find(item => item.id === 'm-num')!
  expect(row.body).toBe('Vendemos bem ontem.')
  expect(row.indicatorOffer).toEqual({
    messageId: 'm-num', name: 'Vendas de ontem',
    data: { kind: 'numero', value: 'R$ 1.240', raw: 1240, trend: { text: '+12% desde ontem', direction: 'up', goodWhen: 'up' } },
  })
  h.events.append({ id: 'm-fake', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: marker(SALES), actorId: 'ana', subjectId: '', occurredAt: CLOCK })
  const human = geral(h).find(item => item.id === 'm-fake')!
  expect(human.indicatorOffer).toBeUndefined()
  expect(human.body).toContain('[[indicador:')
})

it('pinning WITHOUT a test is refused: "Teste antes de fixar"', async () => {
  const { h } = setup()
  const refused = await fault(() => h.pinIndicator({ ...SCOPE, testId: 'itest:nada', name: 'X', schedule: 'daily' }))
  expect(refused.code).toBe('invalid-payload')
  expect(refused.message).toContain('Teste antes de fixar')
  expect(h.listIndicators(SCOPE)).toEqual([])
})

it('the test is a quiet turn with the original request and the format of before; its real result is shown and nothing is written to the thread', async () => {
  const ctx = setup()
  const before = geral(ctx.h).length
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 1.300', bruto: 1300 }))
  const test = await ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' })
  expect(test.name).toBe('Vendas de ontem')
  expect(test.data).toMatchObject({ kind: 'numero', value: 'R$ 1.300', raw: 1300 })
  expect(ctx.asked).toHaveLength(1)
  expect(ctx.asked[0]).toContain('quanto vendemos ontem?')
  expect(ctx.asked[0]).toContain('SOMENTE com uma linha')
  expect(ctx.asked[0]).toContain('[[indicador:')
  expect(geral(ctx.h)).toHaveLength(before)
})

it('a test that cannot produce the number (another format, no marker, an error) is refused with the reason, and nothing can be pinned from it', async () => {
  const ctx = setup()
  ctx.answers.push(marker({ tipo: 'meta', nome: 'Meta', valor: 1, meta: 2 }))
  expect((await fault(() => ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' }))).message).toContain('outro formato')
  ctx.answers.push('Não sei dizer.')
  expect((await fault(() => ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' }))).message).toContain('formato combinado')
  ctx.answers.push(new Error('A conexão com a loja caiu.'))
  expect((await fault(() => ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' }))).message).toContain('A conexão com a loja caiu.')
  expect((await fault(() => ctx.h.testIndicator({ ...SCOPE, messageId: 'm-ask' }))).code).toBe('not-found') // the person's own message is not a number
  expect(h(ctx).listIndicators(SCOPE)).toEqual([])
})

const h = (ctx: Ctx): PersonaHost => ctx.h

it('pin after a fresh test: the card has the tested value, the schedule and the alert; the same message cannot be pinned twice; a drop alert is for numbers only', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { alertDropPct: 20 })
  expect(view).toMatchObject({ name: 'Vendas de ontem', kind: 'numero', schedule: 'daily', status: 'ok', alertDropPct: 20, personaId: 'nina', sourceMessageId: 'm-num' })
  expect(view.data).toMatchObject({ value: 'R$ 1.300' })
  expect(ctx.h.listIndicators(SCOPE)).toHaveLength(1)
  ctx.answers.push(marker({ ...SALES }))
  const again = await ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' })
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: again.testId, name: 'Outra', schedule: 'hourly' }))).code).toBe('conflict')
  expect(ctx.h.listIndicators(SCOPE)).toHaveLength(1)
})

it('an alert on a number that is not a number (a goal) is refused: only numbers can warn about a fall', async () => {
  const ctx = setup()
  ctx.h.events.append({ id: 'm-meta', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: marker({ tipo: 'meta', nome: 'Meta do mês', valor: 18, meta: 30 }), actorId: 'nina', subjectId: '', occurredAt: CLOCK })
  ctx.answers.push(marker({ tipo: 'meta', nome: 'Meta do mês', valor: 19, meta: 30 }))
  const test = await ctx.h.testIndicator({ ...SCOPE, messageId: 'm-meta' })
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'Meta', schedule: 'daily', alertDropPct: 20 }))).message).toContain('Só um número')
  expect(ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'Meta', schedule: 'daily' })).toMatchObject({ kind: 'meta' })
})

it('pin validations: a name, a schedule, a sensible alert, and a test that is not too old', async () => {
  const ctx = setup()
  ctx.answers.push(marker(SALES), marker(SALES), marker(SALES))
  const test = await ctx.h.testIndicator({ ...SCOPE, messageId: 'm-num' })
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: '   ', schedule: 'daily' }))).message).toContain('nome')
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'X', schedule: 'weekly' as 'daily' }))).message).toContain('quando atualizar')
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'X', schedule: 'daily', alertDropPct: 150 }))).message).toContain('1% a 99%')
  ctx.clock.now = '2026-11-12T11:20:00.000Z' // 20 minutes later: the test is old
  expect((await fault(() => ctx.h.pinIndicator({ ...SCOPE, testId: test.testId, name: 'X', schedule: 'daily' }))).message).toContain('Teste de novo')
})

it('the quiet refresh: the new value replaces the old, a fall past the rule raises the alert on the card (a NOTICE, never an attention event), and no message is written to any conversation', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { alertDropPct: 20 })
  const before = geral(ctx.h).length
  ctx.clock.now = '2026-11-12T12:30:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 900', bruto: 900, tendencia: '-31% desde ontem', direcao: 'desce' }))
  const fresh = await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(fresh).toMatchObject({ status: 'ok', updatedAt: '2026-11-12T12:30:00.000Z', alert: { pct: 31, text: 'Caiu 31% desde a última atualização' } })
  expect(fresh.data).toMatchObject({ value: 'R$ 900', raw: 900 })
  expect(geral(ctx.h)).toHaveLength(before) // silence: nothing posted
  const abort = new AbortController()
  const stream = ctx.h.attentionEvents(SCOPE, abort.signal)[Symbol.asyncIterator]()
  try {
    const frame = await stream.next()
    if (frame.done) throw new Error('attention-stream-ended')
    // a fall is a NOTICE (Muse, P1-08): not an attention event, so it never becomes an approval or a count in the rail
    expect(frame.value.events.some(row => row.id.startsWith('indicator:'))).toBe(false)
  } finally {
    abort.abort()
    await stream.return?.()
  }
  // the next refresh that does not fall clears the alert
  ctx.clock.now = '2026-11-12T13:40:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 950', bruto: 950 }))
  expect((await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })).alert).toBeUndefined()
})

it('a refresh that fails keeps the OLD value, says why, and raises no alert', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { alertDropPct: 20 })
  ctx.clock.now = '2026-11-12T12:30:00.000Z'
  ctx.answers.push(new Error('Não consegui falar com a loja.'))
  const failed = await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(failed).toMatchObject({ status: 'failed', failure: 'Não consegui falar com a loja.', updatedAt: view.updatedAt })
  expect(failed.data).toMatchObject({ value: 'R$ 1.300' })
  expect(failed.alert).toBeUndefined()
})

it('the timer refreshes only what is DUE: hourly after an hour, daily after the 08:00 slot; unpinning takes the number off', async () => {
  const ctx = setup()
  const hourly = await pinned(ctx, { schedule: 'hourly' })
  ctx.clock.now = '2026-11-12T11:30:00.000Z' // 30 minutes: nothing is due
  expect(await ctx.h.indicators.tick()).toBe(0)
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 1.350', bruto: 1350 }))
  ctx.clock.now = '2026-11-12T12:01:00.000Z' // more than an hour: the hourly one is due
  expect(await ctx.h.indicators.tick()).toBe(1)
  expect(ctx.h.listIndicators(SCOPE)[0]?.data).toMatchObject({ value: 'R$ 1.350' })
  expect(ctx.h.unpinIndicator({ ...SCOPE, id: hourly.id })).toBe(true)
  expect(ctx.h.unpinIndicator({ ...SCOPE, id: hourly.id })).toBe(false)
  expect(ctx.h.listIndicators(SCOPE)).toEqual([])
})

it('due rules: hourly is 60 minutes; daily is "after the last 08:00 slot"', () => {
  const at = (iso: string): Date => new Date(iso)
  expect(isDue('hourly', '2026-11-12T10:00:00.000Z', at('2026-11-12T10:59:00.000Z'))).toBe(false)
  expect(isDue('hourly', '2026-11-12T10:00:00.000Z', at('2026-11-12T11:00:00.000Z'))).toBe(true)
  expect(isDue('hourly', 'not a date', at('2026-11-12T11:00:00.000Z'))).toBe(true)
  const now = new Date(2026, 10, 12, 9, 0, 0) // local 09:00
  const slot = lastDailySlot(now)
  expect([slot.getHours(), slot.getDate()]).toEqual([8, 12])
  expect(isDue('daily', new Date(2026, 10, 12, 8, 30, 0).toISOString(), now)).toBe(false) // updated after the slot
  expect(isDue('daily', new Date(2026, 10, 11, 20, 0, 0).toISOString(), now)).toBe(true) // updated last evening
  const early = new Date(2026, 10, 12, 7, 0, 0) // local 07:00: the slot is yesterday's
  expect(lastDailySlot(early).getDate()).toBe(11)
})

// P1-08 (Carbon, colheita S1): no storm of model calls after a failure, no "Atualizando…" forever after a restart, and the alert is SEEN.
it('a failed refresh backs off (15, 30, 60 minutes…): the timer never calls the persona again every minute', async () => {
  const ctx = setup()
  await pinned(ctx, { schedule: 'hourly' })
  const calls = (): number => ctx.asked.length
  const base = calls() // the test that was needed to pin
  const tickAt = async (at: string, answer: string | Error): Promise<number> => {
    ctx.clock.now = at
    ctx.answers.length = 0 // only the answer of THIS tick: a tick that waits must not leave one behind for the next
    ctx.answers.push(answer)
    return ctx.h.indicators.tick()
  }
  expect(await tickAt('2026-11-12T12:01:00.000Z', new Error('A loja caiu.'))).toBe(1) // an hour after the pin: due, and it fails
  expect(calls()).toBe(base + 1)
  expect(await tickAt('2026-11-12T12:02:00.000Z', new Error('A loja caiu.'))).toBe(0) // the next minute: waiting, NOT another call
  expect(await tickAt('2026-11-12T12:10:00.000Z', new Error('A loja caiu.'))).toBe(0)
  expect(calls()).toBe(base + 1)
  expect(await tickAt('2026-11-12T12:17:00.000Z', new Error('A loja caiu.'))).toBe(1) // the first wait (15 min) is over: one more try, fails again
  expect(await tickAt('2026-11-12T12:40:00.000Z', new Error('A loja caiu.'))).toBe(0) // the second wait is 30 min: 23 min later it still waits
  expect(await tickAt('2026-11-12T12:48:00.000Z', marker({ ...SALES, valor: 'R$ 1.400', bruto: 1400 }))).toBe(1) // 31 min later: tries, and it works
  expect(ctx.h.listIndicators(SCOPE)[0]).toMatchObject({ status: 'ok', data: { value: 'R$ 1.400' } })
  expect(ctx.h.listIndicators(SCOPE)[0]?.failure).toBeUndefined()
  // success clears the wait: back to the plain hourly schedule
  expect(await tickAt('2026-11-12T13:18:00.000Z', marker({ ...SALES, valor: 'R$ 1.410', bruto: 1410 }))).toBe(0)
  expect(await tickAt('2026-11-12T13:49:00.000Z', marker({ ...SALES, valor: 'R$ 1.420', bruto: 1420 }))).toBe(1)
})

it('a refresh interrupted by a restart does not stay "Atualizando…" forever: it reads as the old value and runs again', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { schedule: 'hourly' })
  const row = ctx.h.screens.screens.get<Record<string, unknown>>('pp', 'indicator', view.id)
  ctx.h.screens.screens.put('pp', 'indicator', view.id, { ...row, status: 'updating' }) // the process died in the middle of the refresh
  expect(ctx.h.listIndicators(SCOPE)[0]?.status).toBe('ok')
  ctx.clock.now = '2026-11-12T12:05:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 1.350', bruto: 1350 }))
  expect(await ctx.h.indicators.tick()).toBe(1)
  expect(ctx.h.listIndicators(SCOPE)[0]).toMatchObject({ status: 'ok', data: { value: 'R$ 1.350' } })
})

it('the fall is a NOTICE the Visão geral draws from the numbers (its alert), never a decision: it is not in needsYou (the Aprovações count), and goes away when the number recovers or is unpinned', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { alertDropPct: 20 })
  const decisions = (): number => ctx.h.getOverview(SCOPE).needsYou.filter(item => item.title.includes('Vendas de ontem')).length
  const notices = (): string[] => ctx.h.indicators.alerts(SCOPE.projectId).map(alert => alert.title)
  expect(notices()).toEqual([])
  ctx.clock.now = '2026-11-12T12:30:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 900', bruto: 900 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(ctx.h.listIndicators(SCOPE)[0]?.alert).toMatchObject({ pct: 31 }) // the screen draws the notice from this
  expect(notices()).toEqual(['Vendas de ontem caiu 31% desde ontem.'])
  expect(decisions()).toBe(0) // not a decision: the rail number and the Aprovações list never see it
  ctx.clock.now = '2026-11-12T13:40:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 950', bruto: 950 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(notices()).toEqual([])
  expect(ctx.h.listIndicators(SCOPE)[0]?.alert).toBeUndefined()
  ctx.clock.now = '2026-11-12T14:50:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 500', bruto: 500 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(notices()).toHaveLength(1)
  expect(decisions()).toBe(0)
  ctx.h.unpinIndicator({ ...SCOPE, id: view.id })
  expect(notices()).toEqual([])
  expect(ctx.h.listIndicators(SCOPE)).toEqual([])
})

// Muse 05:22: the fall is a NOTICE ("Vendas de ontem caiu 31% desde ontem."); "Já vi" takes it off the list, the card keeps its amber border
// (alert.seen) until the next refresh, and a NEW fall is a new notice.
it('"Já vi" takes the notice off the list; the card keeps its alert as seen; the next fall is a new notice', async () => {
  const ctx = setup()
  const view = await pinned(ctx, { alertDropPct: 20 })
  ctx.clock.now = '2026-11-12T12:30:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 900', bruto: 900 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  const notices = (): string[] => ctx.h.indicators.alerts(SCOPE.projectId).map(alert => alert.title)
  expect(notices()).toEqual(['Vendas de ontem caiu 31% desde ontem.'])
  expect(ctx.h.listIndicators(SCOPE)[0]?.alert?.seen).toBeUndefined()

  const dismissed = ctx.h.dismissIndicatorAlert({ ...SCOPE, id: view.id })
  expect(dismissed.alert).toMatchObject({ pct: 31, seen: true })
  expect(notices()).toEqual([]) // off the list…
  expect(ctx.h.listIndicators(SCOPE)[0]?.alert).toMatchObject({ pct: 31, seen: true }) // …but the card still carries the amber border
  expect(ctx.h.dismissIndicatorAlert({ ...SCOPE, id: view.id }).alert).toMatchObject({ seen: true }) // twice is harmless

  // another fall, even without a recovery in between, is ANOTHER notice (a different instant)
  ctx.clock.now = '2026-11-12T13:40:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 500', bruto: 500 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(notices()).toEqual(['Vendas de ontem caiu 44% desde ontem.'])
  expect(ctx.h.listIndicators(SCOPE)[0]?.alert?.seen).toBeUndefined()

  // a number that recovers has no alert to dismiss; an unknown one says so in plain words
  ctx.clock.now = '2026-11-12T14:50:00.000Z'
  ctx.answers.push(marker({ ...SALES, valor: 'R$ 950', bruto: 950 }))
  await ctx.h.refreshIndicator({ ...SCOPE, id: view.id })
  expect(ctx.h.dismissIndicatorAlert({ ...SCOPE, id: view.id }).alert).toBeUndefined()
  expect((await fault(() => ctx.h.dismissIndicatorAlert({ ...SCOPE, id: 'does-not-exist' }))).message).toContain('não está mais')
})

// P0-07b (Carbon, colheita S1 fix): every `answerOnce` of a persona shared ONE runner (`pp:<persona>:talk:answer-only`) and its single capture of the text, so a number
// refreshing at the same instant the owner asked `/lado` could mix the two answers or empty one. The numbers' quiet turn runs on a runner of ITS OWN.
it('the quiet turn of a number never shares a runner with `/lado` (the text capture of one cannot leak into the other)', async () => {
  const h = openJourney(CLOCK)
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Vendas' },
  ])
  h.events.append({ id: 'm-num', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body: marker(SALES), actorId: 'nina', subjectId: '', occurredAt: CLOCK })
  const answerOnly = (): string[] => [...h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:nina:talk') && key.endsWith(':answer-only'))

  await h.orchestration.answerAside('pp', 'nina', 'lado-1', 'Quanto é 2 + 2?') // the owner's `/lado`
  expect(answerOnly()).toHaveLength(1)
  await h.testIndicator({ ...SCOPE, messageId: 'm-num' }).catch(() => undefined) // the numbers' quiet turn through the real wiring (the scripted answer is not a number: only the runner matters)
  const keys = answerOnly()
  expect(keys, `one runner for both: ${JSON.stringify(keys)}`).toHaveLength(2)
  expect(new Set(keys).size).toBe(2)
})
