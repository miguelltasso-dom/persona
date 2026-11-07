import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * CV-5 (contracts/mentions-fanout.md): `@nome` routes by the WHOLE name (the longest wins, an e-mail names nobody), the message
 * stays in the channel, and a work request that names several personas is ONE Task: the first named leads, the others work "com".
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function persona(h: PersonaHost, id: string, name: string): void {
  h.createPersona({
    id, ...scope, name, title: 'Engenharia', description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  persona(h, 'p-coord', 'Coord')
  persona(h, 'p-ana', 'Ana')
  persona(h, 'p-anabela', 'Anabela')
  persona(h, 'p-nina', 'Nina')
  persona(h, 'p-bento', 'Bento')
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
}

function send(h: PersonaHost, body: string, extra: { responderId?: string } = {}): string {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '', ...extra })
  return id
}

const events = (h: PersonaHost) =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

const linesAbout = (h: PersonaHost, id: string) => events(h).filter(item => item.actorId !== 'ana' && item.id.includes(id))
const tickets = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list()

it('"@Anabela" is Anabela, not Ana: the whole name decides who answers', async () => {
  const h = host()
  seed(h)
  const id = send(h, '@Anabela bom dia, tudo bem?')
  await h.orchestration.flush('pp')
  const speakers = new Set(linesAbout(h, id).map(item => item.actorId))
  expect(speakers.has('p-anabela')).toBe(true)
  expect(speakers.has('p-ana')).toBe(false)
  expect(events(h).some(item => item.id === id)).toBe(true) // the message stays in the channel
})

it('an e-mail names nobody: "bento@Nina.com" is answered by the Coordenação, not by Nina', async () => {
  const h = host()
  seed(h)
  const id = send(h, 'o contato é bento@Nina.com, anotado?')
  await h.orchestration.flush('pp')
  const reply = events(h).find(item => item.id === `coord-${id}-reply`)
  expect(reply?.actorId).toBe('p-coord') // the Coordenação answers: the e-mail addressed nobody
  expect(events(h).some(item => item.actorId === 'p-nina' || item.actorId === 'p-bento')).toBe(false)
  expect(tickets(h)).toHaveLength(0)
})

it('a work request naming two personas is ONE Task: the first leads, the other works "com" it', async () => {
  const h = host()
  seed(h)
  const fake = createFakeRunner()
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = () => Promise.resolve(fake)
  const id = send(h, '@Nina @Bento façam o relatório do mês')
  await h.orchestration.flush('pp')

  expect(tickets(h)).toHaveLength(1)
  const ticket = tickets(h)[0]!
  expect(ticket.execution?.name).toBe('Nina')

  const line = events(h).find(item => item.id === `coord-${id}-with`)
  expect(line?.actorId).toBe('p-nina')
  expect(line?.body).toBe(`Bento está com Nina em “${ticket.title}”.`)
  expect(line?.taskWith).toEqual({
    ticketId: ticket.id, title: ticket.title, lead: { personaId: 'p-nina', name: 'Nina' }, with: [{ personaId: 'p-bento', name: 'Bento' }],
  })

  expect(h.listTasks(scope).find(item => item.id === ticket.id)?.collaborators).toEqual([{ personaId: 'p-bento', name: 'Bento' }])
  expect(h.getProjectBoard(scope).cards.find(card => card.ticketId === ticket.id)?.collaborators).toEqual([{ personaId: 'p-bento', name: 'Bento' }])
  // The worker is told who is with it; the collaborator gets no mandate of its own on this Task.
  expect(fake.delivered.some(item => item.text.includes('Com você nesta tarefa: Bento.'))).toBe(true)
  expect(ticket.mandate.actor.id).toBe('ana')
})

it('a Task for a single persona has no collaborators, and nothing is invented', async () => {
  const h = host()
  seed(h)
  const id = send(h, '@Nina faça o relatório do mês')
  await h.orchestration.flush('pp')
  expect(tickets(h)).toHaveLength(1)
  expect(events(h).some(item => item.id === `coord-${id}-with`)).toBe(false)
  expect(h.listTasks(scope)[0]?.collaborators).toBe(undefined)
  expect(h.getProjectBoard(scope).cards[0]?.collaborators).toBe(undefined)
})

it('"Quem responde" wins over the mention: the chosen persona leads and the cited one works with it', async () => {
  const h = host()
  seed(h)
  const id = send(h, '@Nina faça o relatório do mês', { responderId: 'p-bento' })
  await h.orchestration.flush('pp')
  expect(tickets(h)).toHaveLength(1)
  expect(tickets(h)[0]?.execution?.name).toBe('Bento')
  expect(events(h).find(item => item.id === `coord-${id}-with`)?.taskWith?.with).toEqual([{ personaId: 'p-nina', name: 'Nina' }])
})
