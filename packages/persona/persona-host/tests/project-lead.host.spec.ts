import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Marco Dogfood M2 on a REAL host: the responsible's loop runs inside the scheduler's cycle (after the pull), ONLY when the project's autopilot is on (default OFF, owner's switch). It starts a card that is waiting
 * (the marker `lead_pull` is written BEFORE the start, once a day per card), chases one that is stalled with ONE line in #geral written as the responsible and, if the stall goes on, raises it to the person
 * (the board column "Precisa de você"). The model is never called by the test: `driveTicket` is a spy.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const PP = { workspaceId: 'ws', projectId: 'pp' }
const HOUR = 3_600_000
const NOON = Date.parse('2026-11-12T12:00:00.000Z')

function seed(h: PersonaHost): { clock: { ms: number } } {
  const clock = { ms: NOON }
  h.orchestration.now = () => new Date(clock.ms).toISOString()
  h.timezoneOffsetMinutes = () => 0
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...PP, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of [['p-coord', 'Guia', 'Coordenação'], ['p-bia', 'Bia', 'Redatora']] as const) {
    h.createPersona({
      id, ...PP, name, title, description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  return { clock }
}

function ticket(id: string, state: 'pending' | 'running', updatedAt: string): Ticket {
  return {
    id, title: `Cartão ${id}`, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state, createdAt: '2026-11-12T06:00:00.000Z' }], inputs: [], undelivered: [],
    createdAt: '2026-11-12T06:00:00.000Z', updatedAt, origin: { triggerId: `e-${id}`, triggerIds: [`e-${id}`] },
    execution: { name: 'Bia', directory: '.', assignment: 'go' },
  }
}

const marker = (h: PersonaHost, id: string): unknown => h.screens.screens.get('pp', 'lead_pull', id)
const geral = (h: PersonaHost) => {
  const channel = h.product.listChannels('pp').find(row => row.name === 'geral') // the project's real #geral (its id is `geral:pp`, not `geral`)
  if (channel === undefined) throw new Error('no #geral')
  return h.listMessages({ ...PP, streamKind: 'channel', ownerId: channel.id, actorId: 'ana', afterSeq: 0, limit: 100 }).events
}

it('autopilot OFF (the default): the cycle never touches the board for the responsible', async () => {
  const h = host()
  seed(h)
  vi.spyOn(h.orchestration, 'driveTicket').mockResolvedValue()
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t1', 'pending', '2026-11-12T11:00:00.000Z'))
  await h.proactivityScheduler.cycle()
  expect(marker(h, 't1')).toBeUndefined()
  expect(h.getProjectCare(PP).counts.pulled).toBe(0)
})

it('autopilot ON: the loop starts the waiting card ONCE a day (marker written before the start), as its owner, and the care view counts it', async () => {
  const h = host()
  const { clock } = seed(h)
  const drive = vi.spyOn(h.orchestration, 'driveTicket').mockResolvedValue()
  h.setProjectAutopilot({ ...PP, on: true })
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t1', 'pending', '2026-11-12T11:00:00.000Z'))
  await h.proactivityScheduler.cycle()
  expect(marker(h, 't1')).toMatchObject({ day: '2026-11-12' })
  expect(drive).toHaveBeenCalledWith('pp', 't1')
  expect(h.getProjectCare(PP).counts.pulled).toBe(1)
  clock.ms += 5 * 60_000
  await h.proactivityScheduler.cycle()
  expect(h.getProjectCare(PP).counts.pulled).toBe(1) // the same card is not pulled again today
})

it('a stalled card of "doing": ONE line in #geral written as the responsible, then — if it stays stalled — it is raised to the person (column "Precisa de você")', async () => {
  const h = host()
  const { clock } = seed(h)
  vi.spyOn(h.orchestration, 'driveTicket').mockResolvedValue()
  h.setProjectAutopilot({ ...PP, on: true })
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t2', 'running', '2026-11-12T07:00:00.000Z')) // 5 h without progress
  await h.proactivityScheduler.cycle()
  const chase = geral(h).filter(event => event.body.includes('está parado'))
  expect(chase).toHaveLength(1)
  expect(chase[0]).toMatchObject({ actorId: 'p-coord' }) // the responsible spoke, not the owner
  clock.ms += 5 * 60_000
  await h.proactivityScheduler.cycle()
  expect(geral(h).filter(event => event.body.includes('está parado'))).toHaveLength(1) // idempotent: one nudge per stall
  expect(h.orchestration.kanban('pp').find(card => card.ticketId === 't2')?.column).toBe('doing')
  clock.ms += 3 * HOUR
  await h.proactivityScheduler.cycle()
  expect(h.orchestration.kanban('pp').find(card => card.ticketId === 't2')?.column).toBe('blocked') // "Precisa de você"
})
