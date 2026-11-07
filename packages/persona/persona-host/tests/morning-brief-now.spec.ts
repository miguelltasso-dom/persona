/**
 * TEAM-7, on demand: `postDailyBriefNow` posts the day's "Bom dia" card NOW — the same zero-model facts as the morning ritual, with no
 * clock window and no "nothing changed" rule (the person, or the real round, asked). Idempotent per day; a `requestId` asks for one more
 * card of its own; pausing the routine stops only the automatic card; when there is nothing to say the answer says so.
 */
import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const TODAY = '2026-11-05'
const DAY_ID = `morning-brief:pp:${TODAY}`
const at = (hhmm: string, day: string = TODAY): string => `${day}T${hhmm}:00.000Z` // São Paulo is UTC-3: 18:00Z = 15:00 local

function open(opts: { on?: boolean; coordination?: boolean } = {}): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    ...(opts.coordination === false ? [] : [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }]),
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = opts.on ?? true
  h.timezoneOffsetMinutes = () => -180
  return h
}

function clock(h: PersonaHost, hhmm: string, day: string = TODAY): void {
  h.orchestration.now = () => at(hhmm, day)
}

function ticket(h: PersonaHost, id: string, title: string, by: 'Bia' | 'Teo', over: Partial<Ticket> = {}): void {
  const stamp = '2026-11-05T09:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: `t-${id}`, triggerIds: [`t-${id}`] },
    execution: { name: by, directory: '.', assignment: title }, ...over,
  })
}

/** Bia delivered yesterday, Teo is on something now. */
function seedDay(h: PersonaHost): void {
  ticket(h, 'texto', 'Texto dos 3 posts', 'Bia', { ended: { at: at('18:00', '2026-11-04'), by: 'executor', outcome: 'completed' } })
  ticket(h, 'arte', 'Arte da campanha', 'Teo', { updatedAt: at('10:00') })
}

const cards = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 })
  .events.filter(row => row.dailyBrief !== undefined)

const fault = (run: () => unknown): RemoteFault => {
  try { run() } catch (error) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a RemoteFault')
}

it('with the flag off it answers "off" in words and posts nothing', () => {
  const h = open({ on: false })
  seedDay(h)
  clock(h, '18:00')
  const got = h.postDailyBriefNow({ ...SCOPE })
  expect(got.outcome).toBe('off')
  expect(got.text).toMatch(/ainda não faz o resumo do dia/u)
  expect(cards(h)).toHaveLength(0)
})

it('asked at 15:00 (after the morning window) it posts the day\'s card ONCE by the Coordenação; asking again says "already" and the schedule posts no second one', () => {
  const h = open()
  seedDay(h)
  clock(h, '18:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('not-due') // the ritual would not post now
  const first = h.postDailyBriefNow({ ...SCOPE })
  expect(first).toMatchObject({ outcome: 'posted', messageId: DAY_ID })
  const [card] = cards(h)
  expect(card?.id).toBe(DAY_ID)
  expect(card?.actorId).toBe('guia')
  // asked by hand after noon: the "Resumo do dia" (no greeting of the morning at 15:00), and the card says so (Tally's briefVariant)
  expect(card?.body).toBe('Resumo do dia. Ontem: Bia terminou Texto dos 3 posts. Hoje: Teo: Arte da campanha.')
  expect(card?.dailyBrief).toMatchObject({ day: TODAY, coordinatorPersonaId: 'guia', variant: 'on-demand', today: [{ taskId: 'arte', personaId: 'teo' }] })
  const again = h.postDailyBriefNow({ ...SCOPE })
  expect(again).toMatchObject({ outcome: 'already', messageId: DAY_ID })
  expect(again.text).toMatch(/já está na conversa/u)
  clock(h, '12:00') // next tick of the morning: the day's card is the one that exists
  expect(h.morningBrief.check('pp', 'tick')).toBe('not-due')
  expect(cards(h)).toHaveLength(1)
})

it('if the ritual already posted the day\'s card, asking returns THAT card (no duplicate)', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  expect(h.postDailyBriefNow({ ...SCOPE })).toMatchObject({ outcome: 'already', messageId: DAY_ID })
  expect(cards(h)).toHaveLength(1)
})

it('asked by hand when NOTHING changed since today\'s card: "already" (the card that is there), no second card — a requestId does not change that', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted') // the signature of this state is now remembered
  clock(h, '18:00')
  expect(h.postDailyBriefNow({ ...SCOPE })).toMatchObject({ outcome: 'already', messageId: DAY_ID })
  expect(h.postDailyBriefNow({ ...SCOPE, requestId: 'resuma-1' })).toMatchObject({ outcome: 'already', messageId: DAY_ID })
  expect(cards(h)).toHaveLength(1)
})

it('a requestId asks for one more card of its own when the facts CHANGED since the last one; the same requestId is the same card', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  ticket(h, 'foto', 'Foto da capa', 'Bia', { updatedAt: at('12:00') }) // Bia starts something: the facts changed
  clock(h, '18:00')
  const extra = h.postDailyBriefNow({ ...SCOPE, requestId: 'resuma-1' })
  expect(extra).toMatchObject({ outcome: 'posted', messageId: `${DAY_ID}:ask:resuma-1` })
  expect(h.postDailyBriefNow({ ...SCOPE, requestId: 'resuma-1' })).toMatchObject({ outcome: 'already', messageId: `${DAY_ID}:ask:resuma-1` })
  expect(h.postDailyBriefNow({ ...SCOPE, requestId: 'resuma-2' })).toMatchObject({ outcome: 'already', messageId: `${DAY_ID}:ask:resuma-1` }) // nothing changed since THAT card
  const rows = cards(h)
  expect(rows.map(row => row.id)).toEqual([DAY_ID, `${DAY_ID}:ask:resuma-1`])
  expect(rows.every(row => row.actorId === 'guia')).toBe(true) // never the person's own message
  expect(rows[1]?.dailyBrief?.today.some(line => line.taskId === 'foto')).toBe(true)
})

it('pausing "Resumo da manhã" stops the automatic card only: an explicit ask is still answered', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00')
  h.morningBrief.ensureRoutine('pp')
  h.routines.setPaused(h.morningBrief.routineIdOf('pp'), true)
  expect(h.morningBrief.check('pp', 'app-open')).toBe('paused')
  expect(h.postDailyBriefNow({ ...SCOPE }).outcome).toBe('posted')
  expect(cards(h)).toHaveLength(1)
})

it('nothing to say is said in words — no card, no Task, no model', () => {
  const h = open()
  clock(h, '18:00')
  const got = h.postDailyBriefNow({ ...SCOPE })
  expect(got.outcome).toBe('nothing-to-say')
  expect(got.messageId).toBeUndefined()
  expect(got.text).toMatch(/Ainda não há o que resumir/u)
  expect(cards(h)).toHaveLength(0)
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
})

it('a team with no Coordenação is told how to get the card', () => {
  const h = open({ coordination: false })
  seedDay(h)
  clock(h, '18:00')
  for (const persona of h.product.listPersonas('pp')) { // the workspace may seed one of its own: nobody coordinates
    if (persona.systemRoles.includes('coordination')) h.product.updatePersona({ ...persona, systemRoles: persona.systemRoles.filter(role => role !== 'coordination') }, 'pp')
  }
  expect(h.product.listPersonas('pp').some(persona => persona.systemRoles.includes('coordination'))).toBe(false)
  const got = h.postDailyBriefNow({ ...SCOPE })
  expect(got.outcome).toBe('no-coordination')
  expect(got.text).toMatch(/quem coordena/u)
})

it('a badly formed requestId, or a project that is not the caller\'s, is refused', () => {
  const h = open()
  seedDay(h)
  clock(h, '18:00')
  for (const requestId of ['', 'tem espaço', 'a'.repeat(65), 'a/b']) expect(fault(() => h.postDailyBriefNow({ ...SCOPE, requestId })).code).toBe('invalid-payload')
  expect(() => h.postDailyBriefNow({ workspaceId: 'ws', projectId: 'outro' })).toThrow()
  expect(cards(h)).toHaveLength(0)
})

it('the extra card does not leak into tomorrow\'s "Ontem" (the facts are the Tasks, not the cards)', () => {
  const h = open()
  seedDay(h)
  clock(h, '18:00')
  h.postDailyBriefNow({ ...SCOPE, requestId: 'r1' })
  clock(h, '11:00', '2026-11-06')
  ticket(h, 'foto', 'Foto da capa', 'Teo', { ended: { at: at('15:00', TODAY), by: 'executor', outcome: 'completed' } })
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  const next = cards(h).find(row => row.id === 'morning-brief:pp:2026-11-06')
  expect(next?.dailyBrief?.yesterday.map(line => line.taskId)).toEqual(['foto'])
})

it('the variant follows the hour: asked for before noon it is still the card of the morning; after noon it is the "Resumo do dia"', () => {
  const h = open()
  seedDay(h)
  clock(h, '11:00') // 08:00 local
  const early = h.postDailyBriefNow({ ...SCOPE, requestId: 'cedo' })
  expect(cards(h).find(row => row.id === early.messageId)?.dailyBrief?.variant).toBe('morning')
  expect(cards(h).find(row => row.id === early.messageId)?.body.startsWith('Bom dia.')).toBe(true)
  clock(h, '18:00') // 15:00 local
  ticket(h, 'foto', 'Foto da capa', 'Bia', { updatedAt: at('17:00') }) // something changed since the card of the morning
  const late = h.postDailyBriefNow({ ...SCOPE, requestId: 'tarde' })
  expect(cards(h).find(row => row.id === late.messageId)?.dailyBrief?.variant).toBe('on-demand')
})
