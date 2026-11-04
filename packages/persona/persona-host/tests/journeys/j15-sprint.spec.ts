import { expect } from 'vitest'
import { CLOCK, geralChannelId, openJourney, sayOn, seedJourney, seedProject, it } from './journey-host.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'code' } as const

it('J15 — sprint: planejar, iniciar, encerrar com rolagem e marco; goalId do objetivo', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  seedProject(h, {
    id: 'code', name: 'Software', template: 'software',
    team: [{ id: 'dev', name: 'Bento', title: 'Engenharia', coordination: true }],
  })
  sayOn(h, 'code', 'm-done', 'preciso de um README no projeto')
  await h.orchestration.flush('code')
  sayOn(h, 'code', 'm-late', 'preciso de um changelog no projeto')
  await h.orchestration.flush('code')
  const tasks = h.listTasks(SCOPE)
  expect(tasks.length).toBeGreaterThanOrEqual(1)
  const first = tasks[0]!
  const late = tasks[1] ?? first
  const rt = h.orchestration.runtime('code')
  const doneRow = rt.repo.tickets.get(first.id)
  if (doneRow !== undefined && first.id !== late.id) {
    rt.repo.tickets.save({
      ...doneRow,
      ended: { at: CLOCK, by: 'executor', outcome: 'completed' },
      execution: { name: 'Bento', directory: '.', assignment: first.title },
      updatedAt: CLOCK,
    })
  }

  const sprint = h.createSprint({
    ...SCOPE, id: 'sp-1', name: 'Novembro', objective: 'Publicar o quadro',
    startsAt: CLOCK, endsAt: '2026-11-10T00:00:00.000Z',
  })
  expect(sprint.status).toBe('planejado')
  expect(sprint.goalId).toBe('goal-sprint-sp-1')
  expect(sprint.objective).toBe('Publicar o quadro')
  expect(h.planSprint({
    ...SCOPE, sprintId: 'sp-1', ticketIds: tasks.map(item => item.id),
  }).ticketIds).toEqual(tasks.map(item => item.id))
  expect(h.startSprint({ ...SCOPE, sprintId: 'sp-1' }).status).toBe('ativo')
  h.boards.goals.clear()
  const goals = h.listSprintGoals(SCOPE)
  expect(goals.some(item => item.id === 'goal-sprint-sp-1' && item.phase === 'active')).toBe(true)

  const closed = h.closeSprint({
    ...SCOPE, sprintId: 'sp-1', leftover: 'next', confirmed: true,
  })
  expect(closed.pending).toBeUndefined()
  expect(closed.closed.status).toBe('encerrado')
  expect(closed.summary).toMatch(/Sprint Novembro/)
  expect(closed.summary).toMatch(/entregue|atrasado/)
  expect(closed.next?.ticketIds.some(id => closed.rolledIds.includes(id) || closed.rolledIds.length === 0)).toBe(true)

  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'code', streamKind: 'channel',
    ownerId: geralChannelId(h, 'code'), actorId: 'ana', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => item.body.includes('Sprint Novembro'))).toBe(true)
})
