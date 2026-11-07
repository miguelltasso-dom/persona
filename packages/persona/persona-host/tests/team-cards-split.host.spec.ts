/**
 * The plan card of a request split by function (TEAM-13): its title is the NAME of the work ("Campanha de lançamento"), never the person's
 * own sentence ("Preciso de uma campanha de lançamento do nosso…"), and the morning card does not list the steps the team took between
 * colleagues as lines of their own (Gauge, 01:10).
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'

function rig(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.teamworkEnabled = true
  h.timezoneOffsetMinutes = () => -180
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

it('the title of the plan card is the NAME of the work, and the three parts carry short names', async () => {
  const h = rig()
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await h.orchestration.flush('pp')
  const plan = thread(h).find(row => row.teamPlan !== undefined)?.teamPlan
  expect(plan?.title).toBe('Campanha de lançamento')
  expect(plan?.parts).toHaveLength(3)
  expect(plan?.parts.map(part => part.shortName.toLowerCase()).sort()).toEqual(['arte', 'posts', 'texto'])
  expect(plan?.title).not.toMatch(/^preciso/iu)
})

it('the morning line of the finished request carries the name, the faces, and NO line for the steps between colleagues', async () => {
  const h = rig()
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await h.orchestration.flush('pp')
  const rt = h.orchestration.runtime('pp').repo.tickets
  const parts = rt.list().filter(ticket => ticket.origin.triggerId.startsWith('split:u1:'))
  expect(parts).toHaveLength(3)
  // a help request one of them made and closed by itself: an internal step, never a line of the morning card
  const first = parts[0]
  if (first === undefined) throw new Error('no parts')
  rt.save({
    ...first, id: 'ajuda', title: 'Paleta e formatos de cada rede', origin: { triggerId: 'handoff:x:1', triggerIds: ['handoff:x:1'] },
    ended: { at: '2026-11-03T15:00:00.000Z', by: 'executor', outcome: 'completed' },
  })
  for (const part of parts) rt.save({ ...part, ended: { at: '2026-11-03T14:00:00.000Z', by: 'human', outcome: 'completed' } })
  h.orchestration.now = () => '2026-11-04T11:00:00.000Z'
  expect(h.morningBrief.check('pp', 'app-open')).toBe('posted')
  const brief = thread(h).find(row => row.dailyBrief !== undefined)?.dailyBrief
  expect(brief?.yesterday).toHaveLength(1)
  expect(brief?.yesterday[0]?.title).toMatch(/^Campanha de lançamento \((Texto|Arte|Posts), (Texto|Arte|Posts) e (Texto|Arte|Posts)\)$/u)
  expect(brief?.yesterday[0]?.request?.title).toBe('Campanha de lançamento')
  expect(brief?.yesterday[0]?.request?.personaIds.slice().sort()).toEqual(['bia', 'caio', 'teo'])
  expect(brief?.yesterday[0]?.request?.parts).toHaveLength(3)
  expect(brief?.yesterdayMore).toBe(0)
  expect(JSON.stringify(brief)).not.toContain('Paleta e formatos')
})

it('after the delivery card of a request done in parts, NO line repeats the parts ("Concluído: Texto…; Arte…; Posts…") — in either order, and for every reading of the thread (Atlas, bundle 3)', async () => {
  const h = rig()
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await h.orchestration.flush('pp')
  const parts = h.orchestration.runtime('pp').repo.tickets.list().filter(ticket => ticket.origin.triggerId.startsWith('split:u1:'))
  expect(parts).toHaveLength(3)
  expect(thread(h).some(row => row.deliveryCard !== undefined), 'the delivery card exists once the parts are ready').toBe(true)
  // the person approves each part: the last one closes the request
  for (const part of parts) h.orchestration.completeReview('pp', part.id)
  const lines = thread(h)
  expect(lines.filter(row => row.deliveryCard !== undefined)).toHaveLength(1)
  const repeated = lines.filter(row => /^Concluído:/u.test(row.body))
  expect(repeated, 'the card already says it: no sentence that repeats the parts').toEqual([])
  // and the stored line cannot come back through another reading (followMessages, search): the host never shows it
  expect(h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.some(row => row.body.startsWith('Concluído:'))).toBe(false)
})

/** Everyone who may be the author of a line the thread shows: the members and the personas of the project (a retired persona's words stay hers). */
function knownAuthors(h: PersonaHost): Set<string> {
  const ids = new Set<string>()
  for (const member of h.product.listMembers('ws')) ids.add(member.id)
  for (const persona of [...h.product.listPersonas('pp'), ...h.product.listRetiredPersonas('pp')]) ids.add(persona.id)
  return ids
}

it('EVERY item of the thread has an author that is a person or a persona — never a technical id, never the literal "coordination" (Muse, bundle 3: a "Pronto" with only the time)', async () => {
  const h = rig()
  h.postMessage({ id: 'u1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: CAMPAIGN, actorId: 'ana', subjectId: 'u1' })
  await h.orchestration.flush('pp')
  const parts = h.orchestration.runtime('pp').repo.tickets.list().filter(ticket => ticket.origin.triggerId.startsWith('split:u1:'))
  for (const part of parts) h.orchestration.completeReview('pp', part.id)
  h.orchestration.now = () => '2026-11-04T11:00:00.000Z'
  h.morningBrief.check('pp', 'app-open')
  const known = knownAuthors(h)
  const lines = thread(h)
  expect(lines.length).toBeGreaterThan(2)
  for (const line of lines) {
    expect(known.has(line.actorId), `author "${line.actorId}" of "${line.body.slice(0, 40)}" is neither a member nor a persona`).toBe(true)
  }
  // the part-by-part sentences the cards stand for are not in the thread either: the plan and delivery cards carry them
  expect(lines.filter(line => /^Pronto: /u.test(line.body) && line.deliveryCard === undefined)).toEqual([])
  expect(lines.filter(line => /^Em andamento: /u.test(line.body))).toEqual([])
})

it('a line written with no speaker ("coordination") is shown as the Coordination persona of the project, old bases included', async () => {
  const h = rig()
  const channel = h.product.listChannels('pp').find(row => row.name === 'geral')!.id
  h.events.append({
    id: 'old-1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: channel, type: 'message',
    body: 'Aguardando vaga neste projeto.', actorId: 'coordination', subjectId: 'old-1', occurredAt: '2026-11-04T12:00:00.000Z',
  })
  const line = thread(h).find(row => row.id === 'old-1')
  expect(line?.actorId).toBe('lia') // the Coordination of the project, not an id nobody can name
})
