import { expect, it } from 'vitest'
import {
  MemoryGoalBoard,
  MemorySprintBoard,
  bindSprintGoal,
  closeSprint,
  openSprint,
  planSprint,
  sprintDaysLeft,
  sprintGoal,
  sprintMilestone,
  unfinishedInSprint,
  type Ticket,
} from '../src/index.ts'

const NOW = '2026-11-03T15:00:00.000Z'

function ticket(id: string, ended = false, who?: string): Ticket {
  return {
    id,
    title: id,
    decisionId: 'd1',
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor: { source: 'chat', id: 'ana' },
      scope: 'small',
    },
    channels: [],
    assignments: [],
    inputs: [],
    undelivered: [],
    createdAt: NOW,
    updatedAt: NOW,
    origin: { triggerId: 'm1', triggerIds: ['m1'] },
    ...(ended ? { ended: { at: NOW, by: 'executor' as const, outcome: 'completed' as const } } : {}),
    ...(who !== undefined ? { execution: { name: who, directory: '.', assignment: id } } : {}),
  }
}

it('sprint objective becomes a dsh-goal for coordination planning', () => {
  const sprint = openSprint({
    id: 's1', projectId: 'p', name: 'S1', objective: 'Publicar o site',
    startsAt: '2026-11-03T00:00:00.000Z', endsAt: '2026-11-10T00:00:00.000Z',
    status: 'ativo',
  })
  const goal = sprintGoal(sprint)
  expect(goal.id).toBe('goal-sprint-s1')
  expect(goal.objective).toBe('Publicar o site')
  expect(goal.phase).toBe('active')
  expect(goal.projectId).toBe('p')
  expect(sprintDaysLeft(sprint, '2026-11-07T00:00:00.000Z')).toBe(3)
  const board = new MemoryGoalBoard()
  expect(bindSprintGoal(board, sprint).id).toBe('goal-sprint-s1')
  expect(board.list('p')[0]?.objective).toBe('Publicar o site')
})

it('planning moves tickets between backlog and sprint', () => {
  const sprint = planSprint(openSprint({
    id: 's1', projectId: 'p', name: 'S1', objective: 'Ship',
  }), ['a', 'b'])
  expect(sprint.ticketIds).toEqual(['a', 'b'])
})

it('closing rolls unfinished work and posts a milestone summary', () => {
  const sprint = openSprint({
    id: 's1', projectId: 'p', name: 'Novembro', objective: 'Ship',
    ticketIds: ['done', 'late'], status: 'ativo',
  })
  const tickets = [ticket('done', true, 'Bento'), ticket('late', false)]
  expect(unfinishedInSprint(sprint, tickets)).toEqual(['late'])
  const rolled = closeSprint(sprint, tickets, 'next', NOW)
  expect(rolled.closed.status).toBe('encerrado')
  expect(rolled.closed.ticketIds).toEqual(['done'])
  expect(rolled.rolledIds).toEqual(['late'])
  expect(rolled.next?.ticketIds).toContain('late')
  expect(rolled.goal.phase).toBe('complete')
  expect(rolled.summary).toMatch(/entregue 1/)
  expect(rolled.summary).toMatch(/atrasado 1/)
  expect(rolled.summary).toMatch(/Bento/)

  const toBacklog = closeSprint(sprint, tickets, 'backlog', NOW)
  expect(toBacklog.next).toBeUndefined()
  expect(toBacklog.closed.ticketIds).toEqual(['done'])
  expect(sprintMilestone(sprint, tickets)).toMatch(/Sprint Novembro/)
})

it('MemorySprintBoard keeps the current sprint', () => {
  const board = new MemorySprintBoard()
  board.save(openSprint({ id: 's1', projectId: 'p', name: 'S1', objective: 'A', status: 'planejado' }))
  board.save(openSprint({ id: 's2', projectId: 'p', name: 'S2', objective: 'B', status: 'ativo' }))
  expect(board.current('p')?.id).toBe('s2')
  expect(board.list('other')).toEqual([])
})
