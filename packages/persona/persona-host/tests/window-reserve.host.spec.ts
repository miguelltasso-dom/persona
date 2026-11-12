import { expect } from 'vitest'
import { persistProbeQuota } from '../src/official-quota-persist.ts'
import PersonaHost from '../src/index.ts'
import { postTeamRequest } from '../src/proactivity-wire.ts'
import { WindowResumeQueue, replayTextOf } from '../src/window-reserve.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Harvest 10 — the last 5% of the window. At 95% the team's own work waits and the person's short answers still run;
 * a spent window (100%) is left to the limit flow (D-078: limit book, swap proposal, band). The renewal runs one turn
 * per conversation.
 */
const { host } = bindHostFile('2026-11-11T18:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const LATER = '2026-11-11T20:00:00.000Z'
let counter = 0

function seed(h: PersonaHost): void {
  counter = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'coord', workspaceId: 'ws', projectId: 'pp', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: true, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

function quota(h: PersonaHost, usedPercent: number, resetsAt = LATER): void {
  persistProbeQuota(h.usage, 'pp', [{
    id: 'work',
    officialQuota: {
      provider: 'claude',
      origin: 'official',
      windows: [{ id: '5h', origin: 'official', usedPercent, resetsAt }],
    },
  }])
}

function stream(h: PersonaHost) {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

async function say(h: PersonaHost, body: string) {
  counter += 1
  const id = `u${String(counter)}`
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const events = stream(h)
  const mine = events.findIndex(item => item.id === id)
  return { id, lines: events.slice(mine + 1).filter(item => item.actorId !== 'ana').map(item => item.body) }
}

function queue(h: PersonaHost) {
  return new WindowResumeQueue(h.screens.screens).list('pp')
}

it('answers a short message at 96% and keeps a work request for the renewal', async () => {
  const h = host()
  seed(h)
  quota(h, 96)

  const chat = await say(h, 'Como você está hoje?')
  expect(chat.lines.length).toBeGreaterThan(0)
  expect(chat.lines.join('|')).not.toMatch(/A janela 5 h/u)

  const work = await say(h, 'Faça a lista de preços novos')
  expect(work.lines.some(line => line.includes('A janela 5 h está em 96%'))).toBe(true)
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  expect(queue(h)).toHaveLength(1)
  expect(queue(h)[0]?.eventIds).toHaveLength(1)
})

it('holds every request of one conversation in ONE row and posts ONE line', async () => {
  const h = host()
  seed(h)
  quota(h, 97)

  await say(h, 'Faça a lista de preços novos')
  await say(h, 'Faça o cartaz da promoção')
  const lines = stream(h).filter(event => event.body.includes('A janela 5 h está em'))
  expect(lines).toHaveLength(1)
  expect(queue(h)).toHaveLength(1)
  expect(queue(h)[0]?.eventIds).toHaveLength(2)
})

it('renews: one turn per conversation with everything that arrived', async () => {
  const h = host()
  seed(h)
  quota(h, 97)
  await say(h, 'Faça a lista de preços novos')
  await say(h, 'Faça o cartaz da promoção')

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')

  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.assignment).toContain('Faça a lista de preços novos')
  expect(tickets[0]?.execution?.assignment).toContain('Faça o cartaz da promoção')
  expect(queue(h)).toHaveLength(0)
})

it('steps aside at 100% (the limit flow owns it) and still spends the last 5% on “Continuar agora”', async () => {
  const h = host()
  seed(h)
  quota(h, 100)

  const chat = await say(h, 'Como você está hoje?')
  expect(chat.lines.join('|')).not.toMatch(/A janela 5 h/u)
  expect(queue(h)).toHaveLength(0)

  quota(h, 96)
  const work = await say(h, 'Faça a lista de preços novos')
  expect(work.lines.some(line => line.includes('A janela 5 h está em 96%'))).toBe(true)
  expect(h.getWindowReserve(scope)).toMatchObject({ state: 'reserve', overridden: false, queued: 1 })
  const after = h.continueWindowNow(scope)
  expect(after).toMatchObject({ state: 'reserve', overridden: true, queued: 0 })
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list().some(ticket => ticket.execution?.assignment?.includes('lista de preços'))).toBe(true)
})

/** The line a held message gets when the persona answers THAT message on its own (what `hasFinalLine` reads). */
function answerOn(h: PersonaHost, messageId: string): void {
  h.events.append({
    id: `coord-${messageId}-reply`, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'Já resolvi isso.', actorId: 'coord', subjectId: '', occurredAt: '2026-11-11T19:30:00.000Z',
  })
}

// P0-08 (Carbon, colheita S1): a quick answer in the last 5% must NEVER erase a work request that is waiting for the renewal.
it('keeps a held work request when the persona answered a DIFFERENT quick question afterwards', async () => {
  const h = host()
  seed(h)
  quota(h, 97)
  const work = await say(h, 'Faça a lista de preços novos')
  expect(work.lines.some(line => line.includes('A janela 5 h está em 97%'))).toBe(true)
  const chat = await say(h, 'Como você está hoje?')
  expect(chat.lines.length).toBeGreaterThan(0) // she answered the quick question (the last 5% is for that)
  expect(queue(h)).toHaveLength(1)
  expect(queue(h)[0]?.eventIds).toHaveLength(1) // and only the work request waits

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.assignment).toContain('lista de preços')
  expect(tickets[0]?.execution?.assignment).not.toContain('Como você está hoje')
  expect(queue(h)).toHaveLength(0)
})

it('skips a held request that was answered ON ITS OWN, and nothing else', async () => {
  const h = host()
  seed(h)
  quota(h, 97)
  const first = await say(h, 'Faça a lista de preços novos')
  answerOn(h, first.id)

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(0)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  expect(queue(h)).toHaveLength(0)
})

it('replays only the held requests that are still unanswered when one of them was answered', async () => {
  const h = host()
  seed(h)
  quota(h, 97)
  const first = await say(h, 'Faça a lista de preços novos')
  await say(h, 'Faça o cartaz da promoção')
  answerOn(h, first.id)

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.assignment).toContain('cartaz da promoção')
  expect(tickets[0]?.execution?.assignment).not.toContain('lista de preços')
})

it('the replay text never carries the raw wire markers of a held message, and the row remembers the first delivery of its request', () => {
  expect(replayTextOf(['Faça a lista de preços', 'Pedido da Nina para a Bia\n[[handoff:{"id":"h1","from":"nina"}]]'])).toBe('Faça a lista de preços\n\nPedido da Nina para a Bia')
  expect(replayTextOf(['só [[review:{"x":1}]] texto'])).toBe('só texto')
  const book = new WindowResumeQueue(host().screens.screens)
  const row = { conversationId: 'channel:geral', streamKind: 'channel' as const, ownerId: 'geral', eventIds: ['e1'], responderId: '', since: 'a', sinceSeq: 1,
    firstDelivery: { executorId: 'coord', title: 'Primeira entrega', mandateActorId: 'ana' } }
  expect(book.hold('pp', row)).toBe('new')
  expect(book.hold('pp', { ...row, eventIds: ['e2'], firstDelivery: { executorId: 'other', title: 'Outra' } })).toBe('merged')
  expect(book.list('pp')[0]).toMatchObject({ eventIds: ['e1', 'e2'], firstDelivery: { executorId: 'coord', title: 'Primeira entrega' } })
})

/** A team with functions (the request that lists several is SPLIT between them, TEAM-13). */
function seedTeam(h: PersonaHost): void {
  seed(h)
  for (const [id, name, title] of [['bia', 'Bia', 'Redação'], ['teo', 'Teo', 'Design']] as const) {
    h.createPersona({
      id, workspaceId: 'ws', projectId: 'pp', name, title, description: title, personality: 'Calma.', instructions: 'Faça.',
      avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.teamworkEnabled = true
}

const works = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list().filter(ticket => !ticket.title.startsWith('Revisar:'))
const assignments = (h: PersonaHost): string[] => works(h).map(ticket => `${ticket.execution?.name ?? '?'}: ${ticket.execution?.assignment ?? ''}`)

// P0-06a (Carbon, colheita S1 fix): the release can never swallow a held request. A request that SPLITS by function used to be the carrier and the next
// request of the conversation (u2) was lost in silence (the split read only u1's words).
it('a held request that SPLITS by function does not swallow the request that came after it', async () => {
  const h = host()
  seedTeam(h)
  quota(h, 97)
  await say(h, 'Faça texto e arte do cartaz da promoção')
  await say(h, 'Monte a tabela de preços')
  expect(queue(h)[0]?.eventIds).toHaveLength(2)

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const rows = assignments(h)
  expect(rows.some(row => row.startsWith('Bia:') && row.includes('texto'))).toBe(true) // the split still happens: her part…
  expect(rows.some(row => row.startsWith('Teo:') && row.includes('arte'))).toBe(true) // …and his
  expect(rows.some(row => row.includes('tabela de preços')), `the second request vanished: ${JSON.stringify(rows)}`).toBe(true)
  expect(queue(h)).toHaveLength(0)
})

// …and a handoff written by a colleague, held in the same conversation as a message of the owner, lost its own Task (the carrier became the owner's
// message and took the handoff's route), so the persona who asked for help waited for her colleague forever.
it('a held handoff keeps its own Task when the owner also wrote in the conversation', async () => {
  const h = host()
  seedTeam(h)
  quota(h, 97)
  const handoff = h.events.append({
    id: 'handoff:t1:c1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'handoff',
    body: 'Pedido da Guia para a Bia', actorId: 'coord', subjectId: '', occurredAt: '2026-11-11T18:10:00.000Z',
  })
  h.orchestration.ingest(handoff, 'channel', 'geral', '', undefined, {
    executorId: 'bia', title: 'Texto do cartaz', mode: 'task', mandateActorId: 'ana', assignment: 'Escreva o texto do cartaz',
  })
  await say(h, 'Monte a tabela de preços')
  expect(works(h)).toHaveLength(0) // both wait for the renewal
  expect(queue(h)[0]?.eventIds).toEqual(['handoff:t1:c1', 'u1'])

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const rows = assignments(h)
  expect(rows.some(row => row.startsWith('Bia:') && row.includes('Escreva o texto do cartaz')), `the handoff Task was lost: ${JSON.stringify(rows)}`).toBe(true)
  expect(rows.some(row => row.includes('tabela de preços')), `the owner's request vanished: ${JSON.stringify(rows)}`).toBe(true)
  expect(rows.filter(row => row.includes('Escreva o texto do cartaz'))).toHaveLength(1) // the owner's words never ran under the handoff's route
  // the Task is born from the HANDOFF's own event (`handoff:<ticket>:<call>`): that is what delivers back to the persona who asked
  const bia = works(h).find(ticket => ticket.execution?.assignment?.includes('Escreva o texto do cartaz'))
  expect(bia?.origin.triggerId).toBe('handoff:t1:c1')
})

it('keeps a routine request out of the model and never answers it with silence', async () => {
  const h = host()
  seed(h)
  quota(h, 96)
  const result = postTeamRequest(h, {
    id: 'routine-run:manha:1', workspaceId: 'ws', projectId: 'pp',
    actorId: 'routine:manha', personaId: 'coord', body: '@Guia Resumo curto da equipe', kind: 'routine',
  })
  expect(result.ok).toBe(false)
  expect(queue(h)).toHaveLength(1)
  expect(stream(h).some(event => event.body.includes('A janela 5 h está em 96%'))).toBe(true)
})

it('keeps the requests when the window renews before the release runs', async () => {
  const h = host()
  seed(h)
  quota(h, 97, '2026-11-11T20:00:00.000Z')
  await say(h, 'Faça a lista de preços novos')
  quota(h, 97, '2026-11-12T01:00:00.000Z')
  await say(h, 'Faça o cartaz da promoção')
  expect(queue(h)[0]?.eventIds).toHaveLength(2)

  quota(h, 30, '2026-11-12T03:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
  await h.orchestration.flush('pp')
  const tickets = h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.assignment).toContain('lista de preços')
  expect(tickets[0]?.execution?.assignment).toContain('cartaz da promoção')
})

it('does not hold or override a spent window', async () => {
  const h = host()
  seed(h)
  quota(h, 100)
  await say(h, 'Faça a lista de preços novos')
  expect(h.continueWindowNow(scope)).toMatchObject({ state: 'exhausted', overridden: false, queued: 0 })
  expect(queue(h)).toHaveLength(0)
})
