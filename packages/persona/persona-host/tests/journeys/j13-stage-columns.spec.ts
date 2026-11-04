import { expect } from 'vitest'
import { CLOCK, openJourney, sayOn, seedJourney, seedProject, it } from './journey-host.ts'

it('J13 — concluir vai à 1ª done do projeto; Attention é needs_you, em 3 fluxos', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  const models = [
    { id: 'p-hire', name: 'Contratação', template: 'contratacao' as const },
    { id: 'p-site', name: 'Site', template: 'site' as const },
    { id: 'p-code', name: 'Software', template: 'software' as const },
  ]
  for (const model of models) {
    seedProject(h, {
      ...model,
      team: [{ id: `${model.id}-c`, name: 'Guia', title: 'Coordenação', coordination: true }],
    })
    const scope = { workspaceId: 'ws', projectId: model.id }
    sayOn(h, model.id, `ask-${model.id}`, 'preciso de um README no projeto?')
    await h.orchestration.flush(model.id)
    const board = h.getProjectBoard(scope)
    const card = board.cards[0]
    expect(card, model.template).toBeDefined()
    expect(card!.category).toBe('needs_you')
    const needsYou = board.workflow.columns.find(column => column.category === 'needs_you')
    if (needsYou !== undefined) expect(card!.columnId).toBe(needsYou.id)

    const rt = h.orchestration.runtime(model.id)
    const ticket = rt.repo.tickets.get(card!.ticketId)
    expect(ticket).toBeDefined()
    rt.repo.tickets.save({
      ...ticket!,
      ended: { at: CLOCK, by: 'human', outcome: 'completed' },
      updatedAt: CLOCK,
    })
    h.store.db.prepare('DELETE FROM ticket_seat WHERE ticket_id = ?').run(card!.ticketId)
    const after = h.getProjectBoard(scope)
    const doneCol = after.workflow.columns.find(column => column.category === 'done')
    expect(doneCol).toBeDefined()
    const placed = after.cards.find(row => row.ticketId === card!.ticketId)
    expect(placed?.category).toBe('done')
    expect(placed?.columnId).toBe(doneCol!.id)
  }
})
