import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-13 (D-090 #1), in the host: without an @mention the request goes to the persona of its FUNCTION, and a request that lists
 * functions becomes one Task per persona. Behind `Config.teamwork` (off by default: the old default stays). The thread says who took
 * what; a paused persona keeps her part out of the way and the line says so; an @mention still wins.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const CAMPAIGN = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
let serial = 0

function rig(on: boolean): PersonaHost {
  serial = 0
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.teamworkEnabled = on
  return h
}

async function ask(h: PersonaHost, body: string): Promise<string> {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id })
  await h.orchestration.flush('pp')
  return id
}

/** The Tasks of WORK (the review step that follows a delivery, "Revisar: …", is another feature's and not counted here). */
const tickets = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list().filter(item => !item.title.startsWith('Revisar:'))
/** The old default: the first persona of the roster (in the host's own order) that is not Coordination. */
const firstExecutor = (h: PersonaHost): string | undefined => h.product.listPersonas('pp').find(item => !item.systemRoles.includes('coordination'))?.name
const thread = (h: PersonaHost) => h.events.listProject('pp')
const said = (h: PersonaHost, id: string) => thread(h).filter(item => item.id.startsWith(`coord-${id}-`)).map(item => item.body)

it('with the switch OFF nothing changes: the whole request is ONE Task, on the first persona that is not Coordination', async () => {
  const h = rig(false)
  await ask(h, CAMPAIGN)
  expect(tickets(h)).toHaveLength(1)
  expect(tickets(h)[0]?.execution?.name).toBe(firstExecutor(h))
  expect(thread(h).some(item => item.id.startsWith('split:'))).toBe(false)
})

it('ON, a list of functions: one Task per persona, in the order written, each with its own part', async () => {
  const h = rig(true)
  const id = await ask(h, CAMPAIGN)
  const rows = tickets(h)
  expect(rows.map(item => item.execution?.name).sort()).toEqual(['Bia', 'Caio', 'Teo']) // one each (the order written is the order of the line below)
  const bia = rows.find(item => item.execution?.name === 'Bia')
  expect(bia?.execution?.assignment).toContain('Sua parte: texto.')
  expect(bia?.execution?.assignment).toContain('Teo (arte)')
  expect(bia?.execution?.assignment).toContain('não faça a parte deles')
  expect(bia?.execution?.assignment).toContain(CAMPAIGN)
  expect(rows.find(item => item.execution?.name === 'Caio')?.execution?.assignment).toContain('Sua parte: posts.')
  // The plan card (Dividi assim:) is the ONE statement of the split: the sentence is not written next to it (EQUIPE-REAL §0), and the message is
  // answered by the block, so the recovery sweep does not answer it again.
  expect(said(h, id).join('|')).not.toContain('Dividi o pedido')
  expect(thread(h).find(item => item.id === 'team-plan:split-' + id)?.body).toContain('Dividi assim')
  expect(h.messageFlags.of('pp', id).fanoutId).toBe('split-' + id)
  // Each part is a short line of the TEAM (never a copy of the whole request, never taken for the person's words).
  const parts = thread(h).filter(item => item.id.startsWith(`split:${id}:`))
  expect(parts.map(item => item.body)).toEqual(['Parte de Bia: texto', 'Parte de Teo: arte', 'Parte de Caio: posts'])
  expect(parts.every(item => item.actorId === 'team:split')).toBe(true)
  expect(rows.every(item => item.mandate.actor.id === 'ana')).toBe(true) // the Tasks carry HER mandate, not the team line's
})

it('ON, one function: the Task goes to the persona of that function and the thread says who took it', async () => {
  const h = rig(true)
  const id = await ask(h, 'Preciso da arte do cartaz de domingo')
  expect(tickets(h)).toHaveLength(1)
  expect(tickets(h)[0]?.execution?.name).toBe('Teo')
  expect(thread(h).some(item => item.id.startsWith('coord-') && item.body.includes('Teo'))).toBe(true)
  expect(said(h, id).join('|')).not.toContain('Dividi o pedido') // one owner is not a split
})

it('ON, a request that names no function keeps the old default (first persona that is not Coordination)', async () => {
  const h = rig(true)
  await ask(h, 'Faça a lista de preços novos')
  expect(tickets(h)).toHaveLength(1)
  expect(tickets(h)[0]?.execution?.name).toBe(firstExecutor(h))
})

it('ON, an @mention still wins over the function: "@Caio escreva o texto…" is Caio\'s', async () => {
  const h = rig(true)
  await ask(h, '@Caio escreva o texto da campanha')
  expect(tickets(h)).toHaveLength(1)
  expect(tickets(h)[0]?.execution?.name).toBe('Caio')
})

it('ON, the persona of the function is paused: the request waits for her, it does not go to someone of another function', async () => {
  const h = rig(true)
  h.orchestration.setPersonaPaused('pp', 'teo', true)
  const id = await ask(h, 'Preciso da arte do cartaz de domingo')
  expect(tickets(h)).toHaveLength(0)
  expect(said(h, id)).toContain('Teo está pausada. Use /retomar para voltar.')
})

it('ON, a list with one persona paused: the others go on, the paused one is named in the line (nothing dropped in silence)', async () => {
  const h = rig(true)
  h.orchestration.setPersonaPaused('pp', 'teo', true)
  const id = await ask(h, CAMPAIGN)
  expect(tickets(h).map(item => item.execution?.name).sort()).toEqual(['Bia', 'Caio'])
  // The plan card carries the two parts that go on; the line only says what the card cannot: who is paused and what to do.
  expect(said(h, id)).toEqual(['Teo está pausada, então arte espera: use /retomar e peça de novo.'])
})

it('the same message is not split twice: a repeat of the request does not open the parts again', async () => {
  const h = rig(true)
  const id = await ask(h, CAMPAIGN)
  h.orchestration.ingest(h.events.get(id)!, 'channel', 'geral')
  await h.orchestration.flush('pp')
  expect(tickets(h)).toHaveLength(3)
})

// ---- TEAM-R3 · R6 · R8: titles, one closing line, who "the team" is ----

it('each part has a SHORT HUMAN title: the function and the subject, never the whole sentence, never cut inside a word (TEAM-R3)', async () => {
  const h = rig(true)
  await ask(h, CAMPAIGN)
  const titles = tickets(h).map(item => item.title).sort()
  expect(titles).toHaveLength(3)
  for (const title of titles) {
    expect(title, title).toMatch(/^(Texto|Arte|Posts) da campanha de lançamento/u)
    expect(title.length, title).toBeLessThanOrEqual(49)
    expect(title, title).not.toMatch(/preciso|:|\bpos$/u)
  }
})

it('the request is closed ONCE: the parts wait for their sisters and one line names each part a single time (TEAM-R6)', async () => {
  const h = rig(true)
  await ask(h, CAMPAIGN)
  const rows = tickets(h)
  const lines = () => thread(h).filter(item => item.id.includes('milestone'))
  h.orchestration.completeReview('pp', rows[0]!.id)
  h.orchestration.completeReview('pp', rows[1]!.id)
  expect(lines()).toHaveLength(0) // not finished yet: nothing to say
  h.orchestration.completeReview('pp', rows[2]!.id)
  expect(lines()).toHaveLength(1)
  const body = lines()[0]?.body ?? ''
  expect(body.startsWith('Concluído: ')).toBe(true)
  for (const row of rows) expect(body.split(row.title), row.title).toHaveLength(2) // every part exactly once
})

it('a lone Task closes with its own title only — the digest of everything closed before it is gone (TEAM-R6)', async () => {
  const h = rig(true)
  await ask(h, '@Bia escreva o texto da página inicial')
  await ask(h, '@Teo crie a arte do cartaz de domingo')
  const [first, second] = tickets(h)
  h.orchestration.completeReview('pp', first!.id)
  h.orchestration.completeReview('pp', second!.id)
  const lines = thread(h).filter(item => item.id.includes('milestone')).map(item => item.body)
  expect(lines).toHaveLength(2)
  expect(lines[1]).toBe(`Concluído: ${second!.title}.`)
  expect(lines[1]).not.toContain(first!.title)
})

it('"the team" of a round of opinion is the people LINKED to the work: the sister parts, the passages, the Coordenação — not the whole company (TEAM-R8)', async () => {
  const h = rig(true)
  await ask(h, CAMPAIGN)
  const bia = tickets(h).find(item => item.execution?.name === 'Bia')!
  expect([...h.orchestration.involvedPersonaIds('pp', bia.id)].sort()).toEqual(['bia', 'caio', 'lia', 'teo'])
  const lone = rig(true)
  await ask(lone, '@Bia escreva o texto da página inicial')
  const loneTicket = tickets(lone)[0]!
  expect([...lone.orchestration.involvedPersonaIds('pp', loneTicket.id)].sort()).toEqual(['bia', 'lia']) // nobody else is linked to it
  expect(lone.orchestration.involvedPersonaIds('pp', 'ghost')).toEqual([])
})

// Fechado (Anvil, 05/11 01:15): o cartão do plano absorve na LEITURA só a linha com `stateLine` (`TeamCards.absorbed`); a linha "pronto" de uma parte é também
// onde a persona PERGUNTA à pessoa, e a pergunta não tem `stateLine`: o §0.6 da Muse manda a pergunta entrar no fio.
it('the QUESTION of a part to the person stays visible in the thread even when the request has its plan card (§0.6, D-079)', async () => {
  const h = rig(true)
  h.sessionMemberId = 'ana'
  h.orchestration.liveQuestion = 'Qual a paleta da marca?'
  await ask(h, CAMPAIGN)
  const shown = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  expect(thread(h).some(item => item.body.includes('Qual a paleta da marca?'))).toBe(true) // it is stored…
  expect(shown.some(item => item.body.includes('Qual a paleta da marca?'))).toBe(true) // …and must be shown
})

// ---- R1 (Keel/Quill): every STATE line the host writes is typed in the database; the cards can take it in without reading words ----

type StoredFlags = { stateLine?: { kind: string; ticketId: string; groupId?: string; text: string } }
const flagsOf = (h: PersonaHost, id: string): StoredFlags => (h.screens.screens.get<StoredFlags>('pp', 'message_flags', id) ?? {})
/** The team layer on, and the review step off: a delivered Task then writes its own "Pronto:" line (with the review on it waits for the reviewer). */
function rigNoReview(): PersonaHost {
  const h = rig(true)
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
const stateRows = (h: PersonaHost) => h.events.listProject('pp').filter(item => /^(Em andamento|Pronto): /u.test(item.body) && !item.actorId.includes(':') && !item.id.startsWith('team-')) // the cards are not host state lines

it('every "Em andamento:" and host-written "Pronto:" line of a lone Task is TYPED in the database: no state line without stateLine (R1)', async () => {
  const h = rigNoReview()
  await ask(h, '@Bia escreva o texto da página inicial')
  await ask(h, '@Teo crie a arte do cartaz de domingo')
  const rows = stateRows(h)
  expect(rows.map(item => item.body.split(':')[0]).sort()).toEqual(['Em andamento', 'Em andamento', 'Pronto', 'Pronto'])
  for (const row of rows) expect(flagsOf(h, row.id).stateLine, row.id).toBeDefined()
  const bia = tickets(h).find(item => item.execution?.name === 'Bia')
  expect(flagsOf(h, 'exec-' + bia!.id + '-progress').stateLine).toEqual({ kind: 'task_progress', ticketId: bia!.id, text: 'status' }) // a lone Task has no group
  const done = rows.find(item => item.body.startsWith('Pronto:'))
  expect(flagsOf(h, done!.id).stateLine).toMatchObject({ kind: 'task_done', text: 'status' })
})

it('the parts of a split carry the SAME group the plan card carries; a question or a failure is never a state line (R1)', async () => {
  const h = rigNoReview()
  const id = await ask(h, CAMPAIGN)
  for (const row of stateRows(h)) {
    const line = flagsOf(h, row.id).stateLine
    expect(line?.groupId, row.id).toBe('split-' + id)
    expect(['task_progress', 'part_done']).toContain(line?.kind)
  }
  const asking = rig(true)
  asking.orchestration.liveQuestion = 'Qual a paleta da marca?'
  await ask(asking, '@Bia escreva o texto da página inicial')
  const question = asking.events.listProject('pp').find(item => item.body.startsWith('Precisa de você:'))
  expect(question).toBeDefined()
  expect(flagsOf(asking, question!.id).stateLine).toBeUndefined() // what needs the person is not a state
})

it('the typed field reaches the screen only with the team layer on, and carries the ticket (R1)', async () => {
  const h = rig(true)
  h.sessionMemberId = 'ana'
  await ask(h, '@Bia escreva o texto da página inicial')
  const read = () => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  const progress = read().find(item => item.id.startsWith('exec-'))
  expect(progress?.stateLine).toMatchObject({ kind: 'task_progress', text: 'status' })
  expect(progress?.stateLine?.ticketId).toBe(tickets(h)[0]?.id)
  h.teamworkEnabled = false
  expect(read().every(item => item.stateLine === undefined)).toBe(true)
})

it('the host does not WRITE what the cards stand for: no progress line when the card has the state, no "Concluído" next to the delivery card (Muse §0)', async () => {
  const h = rig(true)
  h.orchestration.hiddenByCards = (_project, eventId) => eventId.startsWith('exec-') || eventId.endsWith('-milestone')
  await ask(h, CAMPAIGN)
  expect(h.events.listProject('pp').filter(item => item.id.startsWith('exec-'))).toHaveLength(0)
  for (const row of tickets(h)) h.orchestration.completeReview('pp', row.id)
  expect(h.events.listProject('pp').filter(item => item.id.includes('milestone'))).toHaveLength(0)
})
