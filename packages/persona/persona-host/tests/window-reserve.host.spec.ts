import { expect } from 'vitest'
import { persistProbeQuota } from '../src/official-quota-persist.ts'
import PersonaHost from '../src/index.ts'
import { postTeamRequest } from '../src/proactivity-wire.ts'
import { WindowResumeQueue } from '../src/window-reserve.ts'
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

it('does not replay a conversation the persona already answered', async () => {
  const h = host()
  seed(h)
  quota(h, 97)
  await say(h, 'Faça a lista de preços novos')
  await say(h, 'Como você está hoje?')

  quota(h, 30, '2026-11-11T22:00:00.000Z')
  expect(h.orchestration.releaseWindowQueue('pp')).toBe(0)
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  expect(queue(h)).toHaveLength(0)
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
