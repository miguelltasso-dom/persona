import { expect, it } from 'vitest'
import { LeadTrail, MemoryTrailStore } from '../src/lead-trail.ts'
import { ProjectLead, type LeadCard, type LeadPersona, type LeadPorts } from '../src/project-lead.ts'
// (the rig also returns its `ports` so a test can swap one of them for a failing one)

/**
 * Marco Dogfood M2, the responsible's loop, PURE (fake ports, injected clock — it never reads Date.now). One `step` per project per cycle: gates → chase → pull → distribute → summary.
 * Only the pull calls the model (`drive`); everything else is deterministic and costs nothing. All state is in the KV (idempotent, survives a restart); every action leaves ONE trail line with origin `quadro`.
 */
const HOUR = 3_600_000
const T0 = Date.parse('2026-11-12T10:00:00.000Z')

const guia: LeadPersona = { id: 'guia', name: 'Guia', title: 'Coordenação', paused: false, openCount: 0, budgetLeft: true }
const bia: LeadPersona = { id: 'bia', name: 'Bia', title: 'Redatora de textos', paused: false, openCount: 2, budgetLeft: true }
const caio: LeadPersona = { id: 'caio', name: 'Caio', title: 'Designer de artes', paused: false, openCount: 0, budgetLeft: true }

const card = (id: string, over: Partial<LeadCard> = {}): LeadCard => ({ id, title: `Cartão ${id}`, column: 'todo', waitsForPerson: false, ...over })

function rig(over: { cards?: LeadCard[]; personas?: LeadPersona[]; gate?: LeadPorts['gate']; admit?: LeadPorts['admit']; wipFull?: boolean; summary?: LeadPorts['summary']; distribute?: boolean } = {}) {
  let nowMs = T0
  const docs = new Map<string, unknown>()
  const driven: Array<{ projectId: string; ticketId: string; personaId: string; origin: string; marked: boolean }> = []
  const nudges: Array<{ ticketId: string; personaId: string; text: string }> = []
  const escalated: string[] = []
  const state = { cards: over.cards ?? [card('t1'), card('t2')], personas: over.personas ?? [guia, bia, caio] }
  const ports: LeadPorts = {
    nowMs: () => nowMs,
    dayOf: () => new Date(nowMs).toISOString().slice(0, 10),
    responsible: () => ({ id: 'guia', name: 'Guia' }),
    gate: over.gate ?? (() => undefined),
    cards: () => state.cards,
    personas: () => state.personas,
    wipFull: () => over.wipFull === true,
    admit: over.admit ?? (() => ({ ok: true })),
    drive: (projectId, ticketId, personaId, origin) => { driven.push({ projectId, ticketId, personaId, origin, marked: docs.has(`${projectId}/lead_pull/${ticketId}`) }) },
    nudge: (_projectId, ticketId, personaId, text) => { nudges.push({ ticketId, personaId, text }) },
    escalate: (_projectId, ticketId) => { escalated.push(ticketId) },
    summary: over.summary ?? (() => 'not-due'),
    state: { get: <T>(p: string, k: string, i: string) => docs.get(`${p}/${k}/${i}`) as T | undefined, put: (p: string, k: string, i: string, v: unknown) => { docs.set(`${p}/${k}/${i}`, v) } },
  }
  const trail = new LeadTrail(new MemoryTrailStore(), () => new Date(nowMs).toISOString())
  // distribute: true by default in these tests (the v1.1 behavior: give an ownerless card to the least loaded persona); the v1 tests below turn it off.
  const lead = new ProjectLead(ports, trail, { stallAfterMs: 2 * HOUR, maxChases: 1, maxPullsPerDay: 3, distribute: over.distribute !== false })
  return { lead, trail, driven, nudges, escalated, state, ports, advance: (ms: number) => { nowMs += ms } }
}

const kinds = (trail: LeadTrail, projectId = 'pp'): string[] => trail.list(projectId, 50).map(row => row.kind).reverse()

it('pulls the FIRST card of the queue that waits for nobody, hands it to someone of the team (the model is called ONCE) and leaves a trail line with origin "quadro"', () => {
  const { lead, trail, driven } = rig({ cards: [card('t0', { waitsForPerson: true }), card('t1'), card('t2')] })
  lead.step('pp')
  expect(driven).toEqual([{ projectId: 'pp', ticketId: 't1', personaId: 'caio', origin: 'quadro', marked: true }]) // marked = the lead_pull doc existed when the model started (the authority of the run reads it) // t0 waits for the person; Caio has the lowest load
  expect(trail.list('pp', 10).every(row => row.origin === 'quadro' && row.projectId === 'pp')).toBe(true)
  expect(kinds(trail)).toEqual(['lead:pull'])
})

it('distribution: the card\'s own owner wins; else the least loaded of the team who is not paused and has budget; the responsible herself when nobody serves', () => {
  const owned = rig({ cards: [card('t1', { ownerId: 'bia' })] })
  owned.lead.step('pp')
  expect(owned.driven[0]?.personaId).toBe('bia')
  const loaded = rig({ cards: [card('t1')], personas: [guia, { ...bia, openCount: 1 }, { ...caio, openCount: 3 }] })
  loaded.lead.step('pp')
  expect(loaded.driven[0]?.personaId).toBe('bia') // the responsible is the last resort; of the others Bia has the lowest load (1 < 3)
  const noOne = rig({ cards: [card('t1')], personas: [guia, { ...bia, paused: true }, { ...caio, budgetLeft: false }].map(item => item.id === 'guia' ? { ...item, openCount: 9 } : item) })
  noOne.lead.step('pp')
  expect(noOne.driven[0]?.personaId).toBe('guia') // paused / out of budget are never chosen
})

it('the title decides between equals: with the same load, the persona whose title is closest to the card gets it', () => {
  const { lead, driven } = rig({ cards: [card('t1', { title: 'Escrever o texto da campanha' })], personas: [guia, { ...bia, openCount: 0 }, { ...caio, openCount: 0 }].map(item => item.id === 'guia' ? { ...item, openCount: 5 } : item) })
  lead.step('pp')
  expect(driven[0]?.personaId).toBe('bia') // "textos" ~ "texto"
})

it('gates: a paused team, a quiet window or no engine = NOTHING happens, and the reason is written ONCE per day however many cycles pass', () => {
  for (const reason of ['paused', 'quiet', 'no-engine'] as const) {
    const { lead, trail, driven, advance } = rig({ gate: () => reason })
    lead.step('pp'); advance(30_000); lead.step('pp'); advance(30_000); lead.step('pp')
    expect(driven).toEqual([])
    expect(kinds(trail)).toEqual(['lead:hold'])
    expect(trail.list('pp', 5)[0]?.detail).toContain(reason === 'paused' ? 'pausada' : reason === 'quiet' ? 'silêncio' : 'motor')
  }
})

it('admission (the Forge\'s question) is asked right before the model start; a refusal holds the card, writes the reason once and tries again next cycle', () => {
  let open = false
  const { lead, trail, driven, advance } = rig({ admit: () => (open ? { ok: true } : { ok: false, why: 'project-reserve', resumeAt: '2026-11-13T00:00:00.000Z' }) })
  lead.step('pp'); advance(60_000); lead.step('pp')
  expect(driven).toEqual([])
  expect(kinds(trail)).toEqual(['lead:hold'])
  open = true
  advance(60_000)
  lead.step('pp')
  expect(driven).toHaveLength(1)
})

it('a full WIP column pulls nothing (and says nothing: that is normal, not a hold)', () => {
  const { lead, driven, trail } = rig({ wipFull: true })
  lead.step('pp')
  expect(driven).toEqual([])
  expect(trail.list('pp', 5)).toEqual([])
})

it('the day\'s ceiling of pulled cards: the 4th pull of the day does not run; a new day starts again', () => {
  const { lead, driven, advance, state, trail } = rig({ cards: [card('a'), card('b'), card('c'), card('d')] })
  for (let n = 0; n < 4; n += 1) { lead.step('pp'); advance(60_000); state.cards = state.cards.filter(item => item.id !== driven.at(-1)?.ticketId) }
  expect(driven.map(item => item.ticketId)).toEqual(['a', 'b', 'c'])
  expect(kinds(trail)).toContain('lead:hold')
  advance(24 * HOUR)
  lead.step('pp')
  expect(driven.map(item => item.ticketId)).toEqual(['a', 'b', 'c', 'd'])
})

it('chase: a card stalled in "doing" gets ONE nudge (idempotent), then — after another stall window — is raised to the person ONCE, and the loop stops chasing it', () => {
  const stalled = card('t9', { column: 'doing', ownerId: 'bia', stalledMs: 3 * HOUR, waitsForPerson: false })
  const { lead, nudges, escalated, advance, trail, state } = rig({ cards: [stalled] })
  lead.step('pp'); lead.step('pp')
  expect(nudges).toHaveLength(1)
  expect(nudges[0]).toMatchObject({ ticketId: 't9', personaId: 'bia' })
  expect(nudges[0]?.text).toContain('Cartão t9')
  advance(1 * HOUR); lead.step('pp')
  expect(escalated).toEqual([]) // not yet: a whole stall window must pass after the nudge
  advance(2 * HOUR); lead.step('pp'); lead.step('pp')
  expect(escalated).toEqual(['t9'])
  advance(10 * HOUR); lead.step('pp')
  expect(nudges).toHaveLength(1)
  expect(escalated).toEqual(['t9'])
  expect(kinds(trail)).toEqual(['lead:chase', 'lead:escalate'])
  state.cards = [{ ...stalled, stalledMs: 0 }] // she moved: the chase starts over later
  lead.step('pp')
  state.cards = [{ ...stalled, stalledMs: 3 * HOUR }]
  advance(1 * HOUR); lead.step('pp')
  expect(nudges).toHaveLength(2)
})

it('a paused owner is not chased; a card that waits for the person is not chased either', () => {
  const { lead, nudges } = rig({
    cards: [card('t1', { column: 'doing', ownerId: 'bia', stalledMs: 5 * HOUR }), card('t2', { column: 'doing', ownerId: 'caio', stalledMs: 5 * HOUR, waitsForPerson: true })],
    personas: [guia, { ...bia, paused: true }, caio],
  })
  lead.step('pp')
  expect(nudges).toEqual([])
})

it('the day summary: asked once the port says it is due, written ONCE per day (idempotent), a quiet day is recorded and not retried; "waiting" (silence window) is tried again next cycle', () => {
  const outcomes: Array<'posted' | 'quiet-day' | 'waiting' | 'not-due'> = ['waiting', 'posted', 'posted']
  const { lead, trail, advance } = rig({ cards: [], summary: () => outcomes.shift() ?? 'posted' })
  lead.step('pp') // waiting
  advance(60_000); lead.step('pp') // posted
  advance(60_000); lead.step('pp'); lead.step('pp') // already done today: not asked again
  expect(kinds(trail)).toEqual(['lead:summary'])
  expect(outcomes).toEqual(['posted']) // asked exactly twice
  const quiet = rig({ cards: [], summary: () => 'quiet-day' })
  quiet.lead.step('pp'); quiet.advance(60_000); quiet.lead.step('pp')
  expect(kinds(quiet.trail)).toEqual(['lead:summary'])
  expect(quiet.trail.list('pp', 1)[0]?.detail).toContain('sem movimento')
})

it('the day summary is asked FOR a day: today, and yesterday ONLY when the loop was active yesterday (a night past midnight in the silence window still gets its summary); never an older day, never a day the loop did not run', () => {
  const asked: string[] = []
  const { lead, trail, advance, ports } = rig({ cards: [], summary: (_projectId, dayLocal) => { asked.push(dayLocal); return dayLocal === '2026-11-12' ? 'waiting' : 'posted' } })
  lead.step('pp') // 12/11, first cycle ever: no marker for 11/11 => only today is asked
  expect(asked).toEqual(['2026-11-12'])
  advance(24 * HOUR) // 13/11: the loop was active on 12/11 (it stepped), so 12/11 is still owed
  asked.length = 0
  lead.step('pp')
  expect(asked).toEqual(['2026-11-12', '2026-11-13']) // yesterday first, then today
  expect(ports.state.get('pp', 'lead_summary', '2026-11-12')).toBeUndefined() // 'waiting' (a silence window) is tried again
  advance(24 * HOUR) // 14/11: 12/11 is two days old (dropped, not a late summary of two days ago); 13/11 already went on its own day
  asked.length = 0
  lead.step('pp')
  expect(asked).toEqual(['2026-11-14'])
  expect(kinds(trail)).toContain('lead:summary')
})

it('v1 (no way to give a card to someone else): only a card that ALREADY has an owner who can work is driven, as that owner; an ownerless one is said ONCE a day and the next card is tried', () => {
  const { lead, driven, trail, advance } = rig({ distribute: false, cards: [card('sem-dono'), card('t2', { ownerId: 'bia' }), card('t3', { ownerId: 'caio' })] })
  lead.step('pp'); advance(60_000); lead.step('pp'); lead.step('pp')
  expect(driven.map(item => [item.ticketId, item.personaId])).toEqual([['t2', 'bia'], ['t3', 'caio']]) // ONE pull per cycle, each owned card once (idempotent over 3 cycles), each as its own owner; the ownerless card is never driven
  const holds = trail.list('pp', 20).filter(row => row.kind === 'lead:hold')
  expect(holds).toHaveLength(1) // the ownerless card is said once, however many cycles pass
  expect(holds[0]?.detail).toContain('Cartão sem-dono')
  expect(holds[0]?.detail).toContain('escolha o dono')
})

it('v1: an owner who is paused does not count as an owner for this cycle: the card is not driven', () => {
  const { lead, driven } = rig({ distribute: false, cards: [card('t1', { ownerId: 'bia' })], personas: [guia, { ...bia, paused: true }, caio] })
  lead.step('pp')
  expect(driven).toEqual([])
})

it('two projects never share state: the same card id in A and B is pulled in each, the day\'s ceiling and the trail are per project', () => {
  const { lead, driven, trail } = rig({ cards: [card('t1')] })
  lead.step('A'); lead.step('B')
  expect(driven.map(item => item.projectId)).toEqual(['A', 'B'])
  expect(trail.list('A', 10).every(row => row.projectId === 'A')).toBe(true)
  expect(trail.list('B', 10).every(row => row.projectId === 'B')).toBe(true)
})

it('the scheduler\'s own daily budget of each persona rides on the step: a persona it refuses is skipped, the one it accepts is COUNTED once the card is driven', () => {
  const spent: string[] = []
  const { lead, driven } = rig({ cards: [card('t1')] })
  lead.step('pp', { may: personaId => personaId !== 'caio', spend: (personaId) => { spent.push(personaId) } })
  expect(driven.map(item => item.personaId)).toEqual(['bia']) // Caio (the least loaded) is out of budget: the next one serves
  expect(spent).toEqual(['bia'])
  const none = rig({ cards: [card('t1')] })
  none.lead.step('pp', { may: () => false, spend: (personaId) => { spent.push(`never:${personaId}`) } })
  expect(none.driven).toEqual([]) // nobody may start a turn today: no model call, nothing spent
  expect(spent).toEqual(['bia'])
})

it('the admission is asked for the very card about to start (the host answers with the card\'s own key, so the run that follows is not counted twice)', () => {
  const asked: Array<[string, string]> = []
  const { lead, driven } = rig({ cards: [card('t1')], admit: (projectId, ticketId) => { asked.push([projectId, ticketId]); return { ok: true } } })
  lead.step('pp')
  expect(asked).toEqual([['pp', 't1']])
  expect(driven).toHaveLength(1)
})

it('an action that FAILS is never recorded as done: a throwing drive leaves ONE hold line, no pull line and no pull counted; a throwing nudge does not stop the pull', () => {
  const failing = rig({ cards: [card('t1')] })
  const lead = new ProjectLead({ ...failing.ports, drive: () => { throw new Error('sem vaga no runner') } }, failing.trail, { stallAfterMs: 2 * HOUR, maxChases: 1, maxPullsPerDay: 3, distribute: true })
  lead.step('pp')
  expect(kinds(failing.trail)).toEqual(['lead:hold'])
  expect(failing.trail.list('pp', 10)[0]?.detail).toMatch(/Não consegui/u)
  expect(failing.ports.state.get('pp', 'lead_pull_day', '2026-11-12')).toBeUndefined() // the failed start did not use the day's ceiling
  const chasing = rig({ cards: [card('t1', { column: 'doing', ownerId: 'bia', stalledMs: 3 * HOUR }), card('t2', { ownerId: 'caio' })] })
  const loud = new ProjectLead({ ...chasing.ports, nudge: () => { throw new Error('canal fechado') } }, chasing.trail, { stallAfterMs: 2 * HOUR, maxChases: 1, maxPullsPerDay: 3, distribute: true })
  loud.step('pp')
  expect(kinds(chasing.trail)).toEqual(['lead:hold', 'lead:pull']) // the chase failed (said once), the pull went on
  expect(chasing.driven.map(item => item.ticketId)).toEqual(['t2'])
})

it('stats: cycles and actions by kind, per project, read from the same trail', () => {
  const { lead, trail } = rig({ cards: [card('t1')] })
  lead.step('pp'); lead.step('pp')
  expect(trail.stats('pp')).toMatchObject({ cycles: 2, actions: { 'lead:pull': 1 }, refusals: 0 })
  expect(trail.stats('outro')).toMatchObject({ cycles: 0, actions: {}, refusals: 0 })
})
