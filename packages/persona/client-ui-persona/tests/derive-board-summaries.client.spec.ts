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

  it('overlays live card counts onto Muse mock hub when fewer than two projects (PB-5)', () => {
    const summaries = deriveBoardSummaries({
      projects: [],
      kanbanCards: [{
        id: 'c1',
        title: 'Briefing',
        projectId: 'proj-contratacao',
        projectName: 'Contratação — Designer',
        teamId: 't',
        teamName: 'T',
        column: 'todo',
        waitingEvent: false,
        blocked: false,
        reviewApproved: false,
      }],
      nowRows: [],
    })
    const row = summaries.find(s => s.id === 'proj-contratacao')
    expect(row?.counts.todo).toBe(1)
    expect(row?.counts.doing).toBe(0)
  })
})
