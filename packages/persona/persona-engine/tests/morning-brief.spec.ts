import { describe, expect, it } from 'vitest'
import { BRIEF_ON_DEMAND_FROM_MINUTES, briefDueNow, briefShowsSpot, briefTitle, briefVariant, buildMorningBrief, dayBounds, renderMorningText, TITLE_MAX, type MorningBriefInput, type MorningTask } from '../src/morning-brief.ts'

// A São Paulo day: UTC-3. Today = 2026-11-05, yesterday = 2026-11-04.
const BOUNDS = dayBounds('2026-11-05', -180)
const task = (over: Partial<MorningTask> & { taskId: string }): MorningTask => ({ personaId: 'bia', title: 'Cartaz do sábado', state: 'done', updatedAt: '2026-11-04T18:00:00.000Z', ...over })
const BASE: Omit<MorningBriefInput, 'tasks'> = { day: '2026-11-05', ...BOUNDS, needsYouCount: 0 }
const brief = (tasks: readonly MorningTask[], over: Partial<MorningBriefInput> = {}) => buildMorningBrief({ ...BASE, tasks, ...over })

describe('dayBounds: yesterday and today of the person\'s local day', () => {
  it('São Paulo (UTC-3): local midnight is 03:00Z', () => {
    expect(BOUNDS).toEqual({ yesterdayStartIso: '2026-11-04T03:00:00.000Z', todayStartIso: '2026-11-05T03:00:00.000Z' })
  })
  it('a different offset moves both; two offsets cover a DST change; month and year boundaries work', () => {
    expect(dayBounds('2026-01-01', 0)).toEqual({ yesterdayStartIso: '2025-12-31T00:00:00.000Z', todayStartIso: '2026-01-01T00:00:00.000Z' })
    expect(dayBounds('2026-03-01', 60, 120)).toEqual({ yesterdayStartIso: '2026-02-27T22:00:00.000Z', todayStartIso: '2026-02-28T23:00:00.000Z' })
    expect(dayBounds('2026-03-01', 0).yesterdayStartIso).toBe('2026-02-28T00:00:00.000Z')
  })
  it('a day that does not exist is a RangeError', () => {
    expect(() => dayBounds('2026-02-30', 0)).toThrow(RangeError)
    expect(() => dayBounds('amanhã', 0)).toThrow(RangeError)
    expect(() => brief([], { day: '2026-13-01' })).toThrow(RangeError)
  })
})

describe('Ontem: what finished yesterday, most recent first, up to 3 plus "e mais n"', () => {
  it('only Tasks that ended inside yesterday (start inclusive, end exclusive) and only when done', () => {
    const result = brief([
      task({ taskId: 'in-start', endedAt: '2026-11-04T03:00:00.000Z' }),
      task({ taskId: 'in-end', endedAt: '2026-11-05T02:59:59.999Z' }),
      task({ taskId: 'before', endedAt: '2026-11-04T02:59:59.999Z' }),
      task({ taskId: 'today', endedAt: '2026-11-05T03:00:00.000Z' }),
      task({ taskId: 'failed', state: 'failed', endedAt: '2026-11-04T12:00:00.000Z' }),
      task({ taskId: 'blocked', state: 'blocked', endedAt: '2026-11-04T12:00:00.000Z' }),
      task({ taskId: 'no-end' }),
    ])
    expect(result?.yesterday.map(row => row.taskId)).toEqual(['in-end', 'in-start'])
    expect(result?.yesterdayMore).toBe(0)
  })

  it('more recent first, 3 lines, the rest as "e mais n"; ties by id', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e'].map((id, n) => task({ taskId: id, endedAt: `2026-11-04T1${String(n)}:00:00.000Z` }))
    const result = brief([...tasks, task({ taskId: '0tie', endedAt: '2026-11-04T14:00:00.000Z' })])
    // 'e' and '0tie' ended at the same instant: the smaller id first
    expect(result?.yesterday.map(row => row.taskId)).toEqual(['0tie', 'e', 'd'])
    expect(result?.yesterdayMore).toBe(3)
  })

  it('maxYesterday is honoured and clamped to 1..10', () => {
    const tasks = Array.from({ length: 12 }, (_, n) => task({ taskId: `t${String(n).padStart(2, '0')}`, endedAt: `2026-11-04T${String(10 + (n % 10)).padStart(2, '0')}:00:00.000Z` }))
    expect(brief(tasks, { maxYesterday: 1 })?.yesterday).toHaveLength(1)
    expect(brief(tasks, { maxYesterday: 0 })?.yesterday).toHaveLength(1)
    expect(brief(tasks, { maxYesterday: 50 })?.yesterday).toHaveLength(10)
    expect(brief(tasks, { maxYesterday: Number.NaN })?.yesterday).toHaveLength(3)
  })
})

describe('Hoje: who is busy now, one line per persona', () => {
  it('running, waiting and review count as busy; done/failed/blocked do not', () => {
    const result = brief([
      task({ taskId: 'r', personaId: 'bia', state: 'running' }),
      task({ taskId: 'w', personaId: 'teo', state: 'waiting' }),
      task({ taskId: 'v', personaId: 'lia', state: 'review' }),
      task({ taskId: 'd', personaId: 'noa', state: 'done', endedAt: '2026-11-05T05:00:00.000Z' }),
      task({ taskId: 'f', personaId: 'ivo', state: 'failed' }),
      task({ taskId: 'b', personaId: 'zed', state: 'blocked' }),
    ])
    expect(result?.today.map(row => row.personaId)).toEqual(['bia', 'lia', 'teo'])
  })

  it('a persona with two Tasks appears once, on the one updated last (stable on ties)', () => {
    const result = brief([
      task({ taskId: 'old', personaId: 'bia', state: 'running', updatedAt: '2026-11-05T08:00:00.000Z' }),
      task({ taskId: 'new', personaId: 'bia', state: 'waiting', updatedAt: '2026-11-05T09:00:00.000Z' }),
      task({ taskId: 'b2', personaId: 'teo', state: 'running', updatedAt: '2026-11-05T09:00:00.000Z' }),
      task({ taskId: 'a2', personaId: 'teo', state: 'running', updatedAt: '2026-11-05T09:00:00.000Z' }),
    ])
    expect(result?.today).toEqual([
      { taskId: 'new', personaId: 'bia', title: 'Cartaz do sábado' },
      { taskId: 'a2', personaId: 'teo', title: 'Cartaz do sábado' },
    ])
  })
})

describe('only when there is something to say', () => {
  it('nothing yesterday, nobody busy and nothing waiting: nothing is posted (no "dia calmo")', () => {
    expect(brief([])).toBeUndefined()
    expect(brief([task({ taskId: 'f', state: 'failed' }), task({ taskId: 'old', endedAt: '2026-11-01T10:00:00.000Z' })])).toBeUndefined()
  })

  it('something waiting for the person is enough, alone', () => {
    const result = brief([], { needsYouCount: 2 })
    expect(result).toMatchObject({ yesterday: [], yesterdayMore: 0, today: [], needsYou: { count: 2 } })
  })

  it('nothing changed since the last brief AND nothing waits: nothing; but if something waits it is said again', () => {
    const tasks = [task({ taskId: 'a', endedAt: '2026-11-04T12:00:00.000Z' }), task({ taskId: 'w', personaId: 'teo', state: 'running' })]
    const first = brief(tasks)
    expect(first).toBeDefined()
    const again = { lastBrief: { at: '2026-11-04T09:00:00.000Z', signature: first?.signature ?? '' } }
    expect(brief(tasks, again)).toBeUndefined()
    const waiting = brief(tasks, { ...again, needsYouCount: 1 })
    expect(waiting).toBeDefined()
    // and the signature moves with what waits, so the next day's identical state is "changed" only if the facts changed
    expect(waiting?.signature).not.toBe(first?.signature)
  })

  it('any change in the facts changes the signature: a new finished Task, another persona busy, a Task changing state, a different count', () => {
    const tasks = [task({ taskId: 'a', endedAt: '2026-11-04T12:00:00.000Z' }), task({ taskId: 'w', personaId: 'teo', state: 'running' })]
    const base = brief(tasks)?.signature
    const variants = [
      brief([...tasks, task({ taskId: 'b', endedAt: '2026-11-04T13:00:00.000Z' })]),
      brief([...tasks, task({ taskId: 'x', personaId: 'lia', state: 'running' })]),
      brief([tasks[0] as MorningTask, task({ taskId: 'w', personaId: 'teo', state: 'review' })]),
      brief(tasks, { needsYouCount: 3 }),
    ]
    for (const variant of variants) expect(variant?.signature).not.toBe(base)
    expect(new Set([base, ...variants.map(row => row?.signature)]).size).toBe(5)
    // the same facts, in another order, give the same card
    expect(brief([...tasks].reverse())).toEqual(brief(tasks))
  })
})

describe('what the card carries (LEAK-1)', () => {
  it('only the ids and the cleaned Task title: no control characters, bounded, no other field of the Task passes through', () => {
    const noisy = { ...task({ taskId: 'a', endedAt: '2026-11-04T12:00:00.000Z', title: `  Cartaz\n\tdo   sábado ${'x'.repeat(300)} ` }), prompt: 'INSTRUÇÃO INTERNA', assignment: 'segredo' }
    const result = brief([noisy as MorningTask])
    const line = result?.yesterday[0]
    expect(Object.keys(line ?? {}).sort()).toEqual(['personaId', 'taskId', 'title'])
    expect(line?.title).toMatch(/^Cartaz do sábado x+…$/u)
    expect(line?.title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(JSON.stringify(result)).not.toMatch(/INSTRU|segredo/u)
  })

  it('the card is data only: the result is JSON-safe and has exactly the agreed fields', () => {
    const result = brief([task({ taskId: 'a', endedAt: '2026-11-04T12:00:00.000Z' })])
    expect(Object.keys(result ?? {}).sort()).toEqual(['needsYou', 'signature', 'today', 'variant', 'yesterday', 'yesterdayMore'])
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('is pure: nothing async, same facts same card, inputs untouched', () => {
    const tasks = [task({ taskId: 'a', endedAt: '2026-11-04T12:00:00.000Z' })]
    const copy = JSON.stringify(tasks)
    const first = brief(tasks)
    expect(first).not.toBeInstanceOf(Promise)
    expect(brief(tasks)).toEqual(first)
    expect(JSON.stringify(tasks)).toBe(copy)
  })
})

describe('briefDueNow: the first open after 06:00, else 09:00, once a day', () => {
  const day = '2026-11-05'
  it('opening the app before 06:00 does not post; at or after 06:00 it does', () => {
    expect(briefDueNow({ event: 'app-open', localMinutes: 5 * 60 + 59, day })).toBe(false)
    expect(briefDueNow({ event: 'app-open', localMinutes: 6 * 60, day })).toBe(true)
    expect(briefDueNow({ event: 'app-open', localMinutes: 13 * 60, day })).toBe(true)
  })
  it('the clock alone posts only from 09:00 (the app was not opened)', () => {
    expect(briefDueNow({ event: 'tick', localMinutes: 7 * 60, day })).toBe(false)
    expect(briefDueNow({ event: 'tick', localMinutes: 9 * 60, day })).toBe(true)
  })
  it('at most one a day, and a bad clock never posts', () => {
    expect(briefDueNow({ event: 'app-open', localMinutes: 8 * 60, day, lastBriefDay: day })).toBe(false)
    expect(briefDueNow({ event: 'app-open', localMinutes: 8 * 60, day, lastBriefDay: '2026-11-04' })).toBe(true)
    expect(briefDueNow({ event: 'tick', localMinutes: Number.NaN, day })).toBe(false)
  })
})

describe('renderMorningText: the readable body, in Portuguese, no model', () => {
  const result = brief([
    task({ taskId: 'a', personaId: 'bia', title: 'Cartaz do sábado', endedAt: '2026-11-04T12:00:00.000Z' }),
    task({ taskId: 'b', personaId: 'teo', title: 'Arte do cartaz', endedAt: '2026-11-04T11:00:00.000Z' }),
    task({ taskId: 'c', personaId: 'lia', title: 'Post', endedAt: '2026-11-04T10:00:00.000Z' }),
    task({ taskId: 'd', personaId: 'noa', title: 'Legenda', endedAt: '2026-11-04T09:00:00.000Z' }),
    task({ taskId: 'e', personaId: 'bia', title: 'Cardápio novo', state: 'running', updatedAt: '2026-11-05T08:00:00.000Z' }),
  ], { needsYouCount: 2 })
  const names = { bia: 'Bia', teo: 'Teo', lia: 'Lia', noa: 'Noa' }

  it('Ontem (with "e mais n"), Hoje and Precisa de você', () => {
    expect(renderMorningText(result as NonNullable<typeof result>, names)).toBe(
      'Bom dia. Ontem: Bia terminou Cartaz do sábado; Teo terminou Arte do cartaz; Lia terminou Post e mais 1. Hoje: Bia: Cardápio novo. Precisa de você: 2 coisas esperam você.',
    )
  })

  it('singular, a missing section is left out, a persona with no name is never shown as an id', () => {
    const only = buildMorningBrief({ ...BASE, tasks: [], needsYouCount: 1 })
    expect(renderMorningText(only as NonNullable<typeof only>, names)).toBe('Bom dia. Precisa de você: 1 coisa espera você.')
    expect(renderMorningText(result as NonNullable<typeof result>, { bia: 'Bia' })).not.toMatch(/teo|lia|noa/iu)
  })
})

describe('the two cards (Muse, EQUIPE-REAL-SPEC §(b)): "Bom dia · {dia}" in the morning, "Resumo do dia · {hora}" by hand after noon', () => {
  it('the scheduled card is always the morning\'s; a request by hand is the morning\'s before noon and the day summary from 12:00', () => {
    expect(BRIEF_ON_DEMAND_FROM_MINUTES).toBe(720)
    expect(briefVariant({ trigger: 'schedule', localMinutes: 7 * 60 })).toBe('morning')
    expect(briefVariant({ trigger: 'schedule', localMinutes: 20 * 60 })).toBe('morning') // the routine decides when it runs, not this
    expect(briefVariant({ trigger: 'on-demand', localMinutes: 6 * 60 })).toBe('morning')
    expect(briefVariant({ trigger: 'on-demand', localMinutes: 11 * 60 + 59 })).toBe('morning')
    expect(briefVariant({ trigger: 'on-demand', localMinutes: 12 * 60 })).toBe('on-demand')
    expect(briefVariant({ trigger: 'on-demand', localMinutes: 15 * 60 + 40 })).toBe('on-demand')
    expect(briefVariant({ trigger: 'on-demand', localMinutes: 23 * 60 + 59 })).toBe('on-demand')
  })
  it('a time that cannot be read gets the neutral card, never a "Bom dia" said blind', () => {
    expect(briefVariant({ trigger: 'on-demand', localMinutes: Number.NaN })).toBe('on-demand')
    expect(briefVariant({ trigger: 'on-demand', localMinutes: Number.POSITIVE_INFINITY })).toBe('on-demand')
  })
  it('the title and the spot follow the variant', () => {
    expect(briefTitle('morning', { weekday: 'quinta' })).toBe('Bom dia · quinta')
    expect(briefTitle('on-demand', { time: '15:40' })).toBe('Resumo do dia · 15:40')
    expect(briefTitle('morning')).toBe('Bom dia')
    expect(briefTitle('on-demand', { weekday: 'quinta' })).toBe('Resumo do dia') // the morning's part does not leak into the other card
    expect(briefTitle('morning', { weekday: '  ' })).toBe('Bom dia')
    expect(briefShowsSpot('morning')).toBe(true)
    expect(briefShowsSpot('on-demand')).toBe(false)
  })
  it('the variant rides on the card; the default is the morning (what the routine builds)', () => {
    const base = { day: '2026-11-05', ...BOUNDS, tasks: [], needsYouCount: 1 }
    expect(buildMorningBrief(base)?.variant).toBe('morning')
    expect(buildMorningBrief({ ...base, variant: 'on-demand' })?.variant).toBe('on-demand')
    // the variant is not part of what changed: the same facts give the same signature on either card
    expect(buildMorningBrief({ ...base, variant: 'on-demand' })?.signature).toBe(buildMorningBrief(base)?.signature)
  })
  it('the readable body does not greet the morning at 15:00', () => {
    const base = { day: '2026-11-05', ...BOUNDS, tasks: [], needsYouCount: 2 }
    const morning = buildMorningBrief(base)
    const later = buildMorningBrief({ ...base, variant: 'on-demand' })
    expect(renderMorningText(morning as NonNullable<typeof morning>, {})).toBe('Bom dia. Precisa de você: 2 coisas esperam você.')
    expect(renderMorningText(later as NonNullable<typeof later>, {})).toBe('Resumo do dia. Precisa de você: 2 coisas esperam você.')
    expect(renderMorningText(later as NonNullable<typeof later>, {})).not.toMatch(/bom dia/iu)
  })
})

describe('a finished REQUEST is said with nobody name (the Coordenação carries the grouped line; "Lia terminou…" would be false)', () => {
  const grouped = task({ taskId: 'g', personaId: 'lia', title: 'Campanha de lançamento (Texto, Arte e Posts)', endedAt: '2026-11-04T18:00:00.000Z', grouped: true })
  const single = task({ taskId: 'a', personaId: 'bia', title: 'Cartaz do sábado', endedAt: '2026-11-04T12:00:00.000Z' })
  const names = { bia: 'Bia', teo: 'Teo', lia: 'Lia' }
  const built = (tasks: readonly MorningTask[]) => brief(tasks) as NonNullable<ReturnType<typeof brief>>

  it('buildMorningBrief passes the flag on to the line, only when true; the title is untouched', () => {
    const result = brief([grouped, single, task({ taskId: 'x', title: 'Outra', endedAt: '2026-11-04T10:00:00.000Z', grouped: false })])
    expect(result?.yesterday.map(row => [row.taskId, row.grouped])).toEqual([['g', true], ['a', undefined], ['x', undefined]])
    expect(result?.yesterday[0]?.title).toBe('Campanha de lançamento (Texto, Arte e Posts)')
  })

  it('"{work} ficou pronta ({parts})": no person, the parts after the verb, and a single Task is still "{name} terminou {title}"', () => {
    const body = renderMorningText(built([grouped, single]), names)
    expect(body).toBe('Bom dia. Ontem: Campanha de lançamento ficou pronta (Texto, Arte e Posts); Bia terminou Cartaz do sábado.')
    expect(body).not.toMatch(/Lia terminou/u)
  })

  it('it does not depend on names: a grouped line with no known persona is said, a normal one with no name is still left out', () => {
    const result = built([grouped, single])
    expect(renderMorningText(result, {})).toBe('Bom dia. Ontem: Campanha de lançamento ficou pronta (Texto, Arte e Posts).')
    expect(renderMorningText(result, { bia: 'Bia' })).toBe('Bom dia. Ontem: Campanha de lançamento ficou pronta (Texto, Arte e Posts); Bia terminou Cartaz do sábado.')
  })

  it('titles of other shapes: one part, a name with no parts, a title cut by the length limit, parentheses inside the name', () => {
    const say = (title: string) => renderMorningText(built([task({ taskId: 'g', personaId: 'lia', title, endedAt: '2026-11-04T18:00:00.000Z', grouped: true })]), {})
    expect(say('Cartaz (Arte)')).toBe('Bom dia. Ontem: Cartaz ficou pronta (Arte).')
    expect(say('Cartaz do dia')).toBe('Bom dia. Ontem: Cartaz do dia ficou pronta.')
    expect(say('Cartaz (versão 2) (Arte e Texto)')).toBe('Bom dia. Ontem: Cartaz (versão 2) ficou pronta (Arte e Texto).')
    const long = say('Campanha '.repeat(20) + '(Texto e Arte)')
    expect(long).toMatch(/ficou pronta\.$/u) // cut at the limit: no closing parts to move, the whole (shortened) title and the verb
    expect(long).toContain('…')
  })

  it('order and "e mais n" are the same as for any line; the grouped one counts like the others', () => {
    const many = ['a', 'b', 'c', 'd'].map((id, n) => task({ taskId: id, personaId: 'bia', title: 'X' + id, endedAt: '2026-11-04T1' + String(n) + ':00:00.000Z' }))
    const result = built([grouped, ...many])
    expect(result.yesterday.map(row => row.taskId)).toEqual(['g', 'd', 'c'])
    expect(renderMorningText(result, names)).toBe('Bom dia. Ontem: Campanha de lançamento ficou pronta (Texto, Arte e Posts); Bia terminou Xd; Bia terminou Xc e mais 2.')
  })

  it('the day summary says the same thing without the greeting', () => {
    const result = { ...built([grouped]), variant: 'on-demand' as const }
    expect(renderMorningText(result, names)).toBe('Resumo do dia. Ontem: Campanha de lançamento ficou pronta (Texto, Arte e Posts).')
  })
})

describe('ONE criterion for Hoje x Precisa de você: what waits for the person is not also "Hoje"', () => {
  it('a Task flagged needsPerson is out of Hoje (the count comes from the host) and the other Task of that persona is shown instead', () => {
    const result = brief([
      task({ taskId: 'v', personaId: 'lia', state: 'review', needsPerson: true }),
      task({ taskId: 'r', personaId: 'bia', state: 'running' }),
      task({ taskId: 'w', personaId: 'teo', state: 'waiting' }),
      task({ taskId: 'v2', personaId: 'noa', state: 'review', needsPerson: true, updatedAt: '2026-11-05T07:00:00.000Z' }),
      task({ taskId: 'r2', personaId: 'noa', state: 'running', updatedAt: '2026-11-05T06:00:00.000Z' }),
    ], { needsYouCount: 2 })
    expect(result?.today.map(row => [row.personaId, row.taskId])).toEqual([['bia', 'r'], ['noa', 'r2'], ['teo', 'w']])
    expect(result?.needsYou.count).toBe(2)
  })

  it('a review that is NOT hers (a colleague reviewing: no flag, or false) is still Hoje, as before', () => {
    const result = brief([
      task({ taskId: 'c1', personaId: 'lia', state: 'review' }),
      task({ taskId: 'c2', personaId: 'bia', state: 'review', needsPerson: false }),
    ])
    expect(result?.today.map(row => row.personaId)).toEqual(['bia', 'lia'])
  })

  it('only needsPerson Tasks and nothing else: the card is only "Precisa de você" (not empty, not a Hoje line)', () => {
    const result = brief([task({ taskId: 'v', personaId: 'lia', state: 'review', needsPerson: true })], { needsYouCount: 1 })
    expect(result?.today).toEqual([])
    expect(renderMorningText(result as NonNullable<typeof result>, { lia: 'Lia' })).toBe('Bom dia. Precisa de você: 1 coisa espera você.')
    // with the count 0 (the host did not count it) there is nothing to say: a flagged Task alone is not a Hoje line either
    expect(brief([task({ taskId: 'v', personaId: 'lia', state: 'review', needsPerson: true })])).toBeUndefined()
  })
})
