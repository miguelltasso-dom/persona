import { describe, expect, it } from 'vitest'
import { deriveBoardSummaries, inferFlowModel } from '../src/client/boards/derive-board-summaries.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

describe('inferFlowModel (PB-5 hub tiles)', () => {
  it('maps project id/kind hints to flow model ids', () => {
    expect(inferFlowModel('proj-contratacao', undefined)).toBe('contratacao')
    expect(inferFlowModel('my-site', undefined)).toBe('site')
    expect(inferFlowModel('pessoal', 'personal')).toBe('simples')
    expect(inferFlowModel('app-backend', undefined)).toBe('software')
  })
})

describe('deriveBoardSummaries', () => {
  it('counts cards by column category for live projects', () => {
    const cards: KanbanCardModel[] = [
      {
        id: '1',
        title: 'A',
        projectId: 'p1',
        projectName: 'P1',
        teamId: 't',
        teamName: 'T',
        column: 'todo',
        waitingEvent: false,
        blocked: false,
        reviewApproved: false,
      },
      {
        id: '2',
        title: 'B',
        projectId: 'p1',
        projectName: 'P1',
        teamId: 't',
        teamName: 'T',
        column: 'blocked',
        waitingEvent: false,
        blocked: true,
        reviewApproved: false,
      },
    ]
    const summaries = deriveBoardSummaries({
      projects: [{ id: 'p1', name: 'Projeto um' }, { id: 'p2', name: 'Dois' }],
      kanbanCards: cards,
      nowRows: [],
    })
    const p1 = summaries.find(s => s.id === 'p1')
    expect(p1?.counts.todo).toBe(1)
    expect(p1?.counts.needs_you).toBe(1)
    expect(p1?.needsYouCount).toBe(1)
  })

  it('a fresh home shows only the real project, with the delivered card counted (never sample projects)', () => {
    const summaries = deriveBoardSummaries({
      projects: [{ id: 'proj-pessoal', name: 'Pessoal', kind: 'personal' }],
      kanbanCards: [{ id: 'c1', title: 'Resumo da semana', projectId: 'proj-pessoal', projectName: 'Pessoal', teamId: 't', teamName: 'T', waitingEvent: false, blocked: false, reviewApproved: false, column: 'done' }],
      nowRows: [],
    })
    expect(summaries.map(summary => summary.id)).toEqual(['proj-pessoal'])
    expect(summaries[0]?.counts.done).toBe(1)
    expect(JSON.stringify(summaries)).not.toMatch(/proj-contratacao|proj-site|Designer|Site da agência/u)
  })

  it('no projects yet: an empty list, so the screen says it is empty instead of inventing tiles', () => {
    expect(deriveBoardSummaries({ projects: [], kanbanCards: [{ id: 'c1', title: 'Resumo da semana', projectId: 'proj-pessoal', projectName: 'Pessoal', teamId: 't', teamName: 'T', waitingEvent: false, blocked: false, reviewApproved: false, column: 'todo' }], nowRows: [] })).toEqual([])
  })
})
