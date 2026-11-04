import { PERSONA_MIGRATIONS, PERSONA_SCHEMA_VERSION, ProductRepos, openTempStore } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import { CLOCK, reopenJourney, sayOn, seedProject, it } from './journey-host.ts'

it('J17 — v7→v8: Tarefa antiga sem assento cai na 1ª coluna da categoria', async () => {
  const v7 = PERSONA_MIGRATIONS.filter(item => item.version <= 7)
  const handle = await openTempStore({ migrations: v7 })
  new ProductRepos(handle.store, () => CLOCK).createWorkspace({
    id: 'ws', name: 'Acme', personalProjectId: 'pp',
  })
  handle.store.close()
  const h = reopenJourney(handle.path, CLOCK)
  expect(h.store.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  seedProject(h, {
    id: 'legacy', name: 'Legado', template: 'software',
    team: [{ id: 'leg-c', name: 'Guia', title: 'Coordenação', coordination: true }],
  })
  sayOn(h, 'legacy', 'm-legacy', 'preciso de um README no projeto')
  await h.orchestration.flush('legacy')
  const scope = { workspaceId: 'ws', projectId: 'legacy' }
  const task = h.listTasks(scope)[0]
  expect(task).toBeDefined()
  h.store.db.prepare('DELETE FROM ticket_seat WHERE ticket_id = ?').run(task!.id)
  const board = h.getProjectBoard(scope)
  const card = board.cards.find(row => row.ticketId === task!.id)
  const firstOf = board.workflow.columns.find(column => column.category === card?.category)
  expect(card).toBeDefined()
  expect(firstOf).toBeDefined()
  expect(card!.columnId).toBe(firstOf!.id)
})
