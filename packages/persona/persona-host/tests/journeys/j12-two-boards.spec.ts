import { expect } from 'vitest'
import { openJourney, sayOn, seedJourney, seedProject, it } from './journey-host.ts'

it('J12 — Contratação e Site: colunas diferentes, Tarefas isoladas, ACL', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  seedProject(h, {
    id: 'hire', name: 'Contratação', template: 'contratacao',
    team: [{ id: 'rh', name: 'Rita', title: 'Recrutamento', coordination: true }],
  })
  seedProject(h, {
    id: 'web', name: 'Site', template: 'site',
    team: [{ id: 'web-coord', name: 'Gil', title: 'Produto', coordination: true }],
  })

  const hireBoard = h.getProjectBoard({ workspaceId: 'ws', projectId: 'hire' })
  const webBoard = h.getProjectBoard({ workspaceId: 'ws', projectId: 'web' })
  expect(hireBoard.workflow.columns.map(column => column.name)).toContain('Triagem')
  expect(webBoard.workflow.columns.map(column => column.name)).toContain('Descoberta')
  expect(hireBoard.workflow.columns.map(column => column.id))
    .not.toEqual(webBoard.workflow.columns.map(column => column.id))

  sayOn(h, 'hire', 'm-hire', 'preciso de um README no projeto')
  await h.orchestration.flush('hire')
  sayOn(h, 'web', 'm-web', 'preciso de um README no projeto')
  await h.orchestration.flush('web')

  const hireIds = h.getProjectBoard({ workspaceId: 'ws', projectId: 'hire' }).cards.map(card => card.ticketId)
  const webIds = h.getProjectBoard({ workspaceId: 'ws', projectId: 'web' }).cards.map(card => card.ticketId)
  expect(hireIds.length).toBeGreaterThan(0)
  expect(webIds.length).toBeGreaterThan(0)
  expect(hireIds.some(id => webIds.includes(id))).toBe(false)

  h.createMember({
    id: 'guest', workspaceId: 'ws', projectId: 'hire', displayName: 'G', handle: 'g', role: 'guest',
  })
  h.sessionMemberId = 'guest'
  expect(() => h.getProjectBoard({ workspaceId: 'ws', projectId: 'web' })).toThrow('forbidden')
  expect(() => h.createWorkflowFromTemplate({
    workspaceId: 'ws', projectId: 'hire', template: 'simples',
  })).toThrow('forbidden')
})
