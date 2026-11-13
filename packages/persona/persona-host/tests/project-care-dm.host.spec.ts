import { expect, vi } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Carbon P0-13 on the care view ("quem está cuidando de quê"): a Task BORN in a DM carries the DM's words as its title. The care view is read by every member of the project, so a member who is not in the DM reads
 * "Tarefa de uma conversa privada" where the title would be (what waits for the owner, what each persona is doing now) and nothing of the DM; the DM's own participant reads the title.
 */
const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const SECRET = 'segredo-da-ana-5521'

async function derivedFromDm() {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }] })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('sp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  const queue = [`Anotado: guardei o ${SECRET}.`]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  h.postMessage({ id: 'd1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: `Bia, escreva a lista do cliente e guarde o ${SECRET}`, actorId: 'ana', subjectId: 'd1' })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sp')
  const ticket = h.orchestration.runtime('sp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('a DM não abriu Tarefa')
  return { h, ticket }
}

it('the responsible\'s loop reads the board as the LEAST privileged member: the line it writes in the shared #geral and the reason in the care view never carry the words of a DM-born card', async () => {
  const { h, ticket } = await derivedFromDm()
  h.timezoneOffsetMinutes = () => 0
  vi.spyOn(h.orchestration, 'driveTicket').mockResolvedValue()
  h.setProjectAutopilot({ ...SP, on: true })
  const { ended, ...open } = ticket
  void ended
  h.orchestration.runtime('sp').repo.tickets.save({ ...open, assignments: [{ id: 'a-dm', state: 'running', createdAt: '2026-11-12T06:00:00.000Z' }], updatedAt: '2026-11-12T07:00:00.000Z' }) // 5 h without progress
  await h.proactivityScheduler.cycle()
  const channel = h.product.listChannels('sp').find(row => row.name === 'geral')
  if (channel === undefined) throw new Error('no #geral')
  h.sessionMemberId = 'bob'
  const lines = h.listMessages({ ...SP, streamKind: 'channel', ownerId: channel.id, actorId: 'bob', afterSeq: 0, limit: 200 }).events
  expect(lines.some(row => row.body.includes('está parado')), 'control: the loop chased the card (otherwise this test proves nothing)').toBe(true)
  const seen = JSON.stringify([lines, h.getProjectCare(SP)])
  expect(seen.includes(ticket.title), `a shared surface shows the title "${ticket.title}"`).toBe(false)
  expect(seen.includes(SECRET), 'the secret of the DM').toBe(false)
})

it('a Task born in a DM: the participant reads its title in the care view; a member outside the DM reads the neutral title and nothing of the DM', async () => {
  const { h, ticket } = await derivedFromDm()
  h.sessionMemberId = 'ana'
  const own = JSON.stringify(h.getProjectCare(SP))
  expect(own, 'control: the DM participant reads the title (otherwise this test proves nothing)').toContain(ticket.title)
  h.sessionMemberId = 'bob'
  const care = h.getProjectCare(SP)
  const seen = JSON.stringify(care)
  expect(seen.includes(ticket.title), `the care view shows the title "${ticket.title}"`).toBe(false)
  expect(seen.includes(SECRET), 'the secret of the DM').toBe(false)
  expect(seen.includes('dm-ab'), 'the id of the DM').toBe(false)
  expect(seen, 'the neutral title is there instead').toContain('Tarefa de uma conversa privada')
  // The overview of the workspace is the same view for every project: same rule.
  expect(JSON.stringify(h.getCareOverview({ workspaceId: 'ws' })).includes(ticket.title)).toBe(false)
})
