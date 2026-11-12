import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * EQUIPE-REAL §0 (Muse, 05/11 03:29). What a persona says when she finishes her PART of a request is state the plan card already carries
 * ("pronto" on her chip), so it is recorded as a typed `stateLine` (`part_done`, `result`) — also while the review runs (it used to be
 * typed only without a review). The host's own "Pronto: …" of a Task a colleague was asked to do (a passage or a help) says nothing the
 * passage line does not: it stays as the engine's marker under a team author and is never shown in the thread.
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const REQUEST = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const flush = async (h: PersonaHost): Promise<void> => { for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp') }

function rig(review: boolean): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  if (!review) h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const PARTS = ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.']

it('WITH the review on: each persona\'s words at the end of her part are typed part_done/result under the request\'s group (the plan card absorbs them)', async () => {
  const h = rig(true)
  // D-100: the parts are a CHAIN (texto → arte → posts), so the turns run in this order: the text, its review (asks for adjustments), her adjustment, the review again,
  // and only then the art with its review, and the posts with theirs (they used to run side by side, and the review steps came after all three).
  script(h, [PARTS[0]!, 'AJUSTES\n- faltou o nome do produto no texto', 'Ajustei o nome do produto no texto.', 'APROVADO\nAgora sim.', PARTS[1]!, 'APROVADO\nTudo certo.', PARTS[2]!, 'APROVADO\nTudo certo.'])
  say(h, 'c1', REQUEST)
  await flush(h)
  const stored = h.events.listProject('pp').filter(row => row.streamId === 'channel:geral')
  for (const [by, body] of [['bia', PARTS[0]], ['teo', PARTS[1]], ['caio', PARTS[2]]] as const) {
    const line = stored.find(row => row.actorId === by && row.body === body)
    expect(line, `${by}: ${body}`).toBeDefined()
    expect(h.messageFlags.of('pp', line?.id ?? '').stateLine).toMatchObject({ kind: 'part_done', text: 'result', groupId: 'split-c1' })
  }
  // after the author adjusted, her words are the delivery of the part again
  const adjusted = stored.find(row => row.actorId === 'bia' && row.body === 'Ajustei o nome do produto no texto.')
  expect(h.messageFlags.of('pp', adjusted?.id ?? '').stateLine).toMatchObject({ kind: 'part_done', text: 'result', groupId: 'split-c1' })
  // the plan and delivery cards carry the state, so the thread no longer repeats it; the reviewer's lines are NOT state lines (the person wants to see them)
  const rows = thread(h)
  for (const body of [...PARTS, 'Ajustei o nome do produto no texto.']) expect(rows.some(row => row.body === body), body).toBe(false)
  expect(rows.some(row => row.actorId === 'lia' && row.body.includes('pediu ajustes'))).toBe(true)
  expect(rows.filter(row => row.actorId === 'lia' && row.stateLine !== undefined)).toHaveLength(0)
})

it('WITHOUT the review: the same lines stay typed (nothing regressed)', async () => {
  const h = rig(false)
  script(h, PARTS)
  say(h, 'c1', REQUEST)
  await flush(h)
  const typed = h.events.listProject('pp').filter(row => PARTS.includes(row.body))
  expect(typed).toHaveLength(3)
  for (const row of typed) expect(h.messageFlags.of('pp', row.id).stateLine).toMatchObject({ kind: 'part_done', text: 'result', groupId: 'split-c1' })
})

function running(id: string, title: string, by: string): Ticket {
  const stamp = '2026-11-04T11:00:00.000Z'
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: 'c1', triggerIds: ['c1'] },
    execution: { name: by, directory: '.', assignment: title },
  }
}

it('a Task a colleague was asked to do (a passage): the host\'s "Pronto: …" is the engine\'s marker under a team author, not a line in the thread; the Task is done and runs once', async () => {
  const h = rig(false)
  h.orchestration.runtime('pp').repo.tickets.save(running('texto-final', 'Texto final dos 3 posts', 'Bia'))
  say(h, 'c1', 'Bia, escreva o texto final dos 3 posts')
  h.handoffs.ask({
    projectId: 'pp', fromTicketId: 'texto-final', fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts da campanha', kind: 'next', callId: 'bia-teo-1',
    note: { done: ['Texto dos 3 posts aprovado'], needed: ['Uma arte por post'], files: [], decisions: [] },
  })
  await flush(h)
  await flush(h)
  const teo = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Teo')
  expect(teo, "Teo's Task").toBeDefined()
  const marker = h.events.listProject('pp').find(row => row.body.startsWith('Pronto: Arte dos 3 posts'))
  expect(marker, 'the done marker exists (the engine needs it)').toBeDefined()
  expect(marker?.actorId).toMatch(/^team:/u)
  expect(thread(h).some(row => row.body.startsWith('Pronto: Arte dos 3 posts'))).toBe(false) // nobody reads it
  expect(thread(h).some(row => row.handoff !== undefined)).toBe(true) // the passage line stays: it is the state
  expect(h.events.listProject('pp').filter(row => row.body.startsWith('Pronto: Arte dos 3 posts'))).toHaveLength(1) // not run twice
})

it('a DIRECT "@Bia …" request (no plan card): the host\'s "Em andamento: …" carries the typed stateLine task_progress/status, so the reading drops it', async () => {
  const h = rig(false)
  say(h, 'c9', '@Bia escreva o texto curto do cartaz da promoção de pão de queijo da Padaria Lua e depois o Téo faz a arte')
  await flush(h)
  const progress = h.events.listProject('pp').find(row => row.id.startsWith('exec-') && row.id.endsWith('-progress'))
  expect(progress, 'the progress line exists').toBeDefined()
  expect(progress?.body.startsWith('Em andamento:')).toBe(true)
  expect(h.messageFlags.of('pp', progress?.id ?? '').stateLine).toMatchObject({ kind: 'task_progress', text: 'status' })
  expect(thread(h).find(row => row.id === progress?.id)?.stateLine).toMatchObject({ kind: 'task_progress', text: 'status' }) // and it reaches the view
})
