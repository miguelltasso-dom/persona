import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { FIRST_DELIVERY_EVENT_ID } from '../src/onboarding.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * The 6c finding (Bolt, 07/11): the FIRST delivery was closed by two lines, “Concluído: …” (completeReview) and “Primeira entrega pronta: …”
 * (postFirstDeliveryMilestone, fixed id the onboarding uses). The latter is its closing; any other Task keeps its ONE “Concluído”.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
}

function ticket(id: string, triggerId: string): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title: 'Primeira entrega', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `${id}-a1`, state: 'running', createdAt: at, startedAt: at, report: { state: 'ready', summary: 'ok', at } }],
    inputs: [], undelivered: [], createdAt: at, updatedAt: at, origin: { triggerId, triggerIds: [triggerId] },
    execution: { name: 'Bento', directory: '.', assignment: 'Primeira entrega' },
  }
}

const milestone = (h: PersonaHost, id: string) => h.events.listProject('pp').some(event => event.id === `coord-${id}-milestone`)

it('the first delivery is NOT closed twice: completeReview writes no “Concluído” for it', () => {
  const h = host()
  seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t-first', FIRST_DELIVERY_EVENT_ID))
  h.orchestration.completeReview('pp', 't-first')
  expect(milestone(h, 't-first')).toBe(false)
})

it('any other Task keeps its one “Concluído”', () => {
  const h = host()
  seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket('t-other', 'm-other'))
  h.orchestration.completeReview('pp', 't-other')
  expect(milestone(h, 't-other')).toBe(true)
})
