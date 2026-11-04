import { describe, expect, it } from 'vitest'
import { hostBoardSummariesToHub, projectBoardToFlow } from '../src/client/data/adapters/board.ts'
import type { BoardSummaryView, ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'

function sampleProjectBoard(overrides?: Partial<ProjectBoardView>): ProjectBoardView {
  return {
    projectId: 'proj-site',
    projectName: 'Site da agência',
    persisted: true,
    counts: { todo: 1, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 },
    workflow: {
      projectId: 'proj-site',
      template: 'site',
      columns: [
        { id: 'col-todo', name: 'A fazer', category: 'todo' },
        { id: 'col-doing', name: 'Em andamento', category: 'doing', wip: 3 },
        { id: 'col-done', name: 'Concluído', category: 'done', color: '#2ecc71' },
      ],
      fields: [],
    },
    cards: [{
      ticketId: 't-1',
      title: 'Landing page',
      category: 'todo',
      blocked: false,
    }],
    ...overrides,
  }
}

describe('hostBoardSummariesToHub', () => {
  it('maps host listBoards rows to hub tiles', () => {
    const rows: readonly BoardSummaryView[] = [{
      projectId: 'proj-site',
      projectName: 'Site da agência',
      counts: { todo: 1, doing: 2, review: 0, needs_you: 1, done: 3, blocked: 0 },
      currentSprintName: 'Sprint 2',
      workingNow: ['Sol', 'Luna'],
    }]
    const hub = hostBoardSummariesToHub(rows, { 'proj-site': 'site' }, () => 'simples')
    expect(hub).toHaveLength(1)
    expect(hub[0]?.name).toBe('Site da agência')
    expect(hub[0]?.flowModel).toBe('site')
    expect(hub[0]?.needsYouCount).toBe(1)
    expect(hub[0]?.sprintLabel).toBe('Sprint 2')
    expect(hub[0]?.activeWorkers.map(w => w.name)).toEqual(['Sol', 'Luna'])
  })
})

describe('projectBoardToFlow (PB-10 host → flow board)', () => {
  it('maps workflow columns and infers flow model from template', () => {
    const flow = projectBoardToFlow(sampleProjectBoard())
    expect(flow.projectId).toBe('proj-site')
    expect(flow.template).toBe('site')
    expect(flow.columns.map(c => c.id)).toEqual(['col-todo', 'col-doing', 'col-done'])
    expect(flow.columns[1]?.wip).toBe(3)
    expect(flow.columns[2]?.color).toBe('#2ecc71')
  })

  it('resolves kanban column id from host category when columnId is missing', () => {
    const flow = projectBoardToFlow(sampleProjectBoard())
    expect(flow.cards[0]?.columnId).toBe('col-todo')
    expect(flow.cards[0]?.column).toBe('todo')
    expect(flow.cards[0]?.projectName).toBe('Site da agência')
  })

  it('honours explicit columnId and waiting chip', () => {
    const flow = projectBoardToFlow(sampleProjectBoard({
      cards: [{
        ticketId: 't-2',
        title: 'Aguardando cliente',
        category: 'doing',
        columnId: 'col-doing',
        blocked: true,
        chip: 'waiting',
      }],
    }))
    expect(flow.cards[0]?.columnId).toBe('col-doing')
    expect(flow.cards[0]?.column).toBe('in_progress')
    expect(flow.cards[0]?.blocked).toBe(true)
    expect(flow.cards[0]?.waitingEvent).toBe(true)
  })

  it('maps review category to in_review kanban column', () => {
    const board = sampleProjectBoard({
      workflow: {
        ...sampleProjectBoard().workflow,
        columns: [
          { id: 'col-review', name: 'Revisar', category: 'review' },
        ],
      },
      cards: [{
        ticketId: 't-r',
        title: 'Revisão legal',
        category: 'review',
        blocked: false,
      }],
    })
    const flow = projectBoardToFlow(board)
    expect(flow.cards[0]?.column).toBe('in_review')
  })

  it('keeps em_branco template id for blank project flows (PB-10)', () => {
    const flow = projectBoardToFlow(sampleProjectBoard({
      workflow: { ...sampleProjectBoard().workflow, template: 'em_branco' },
    }))
    expect(flow.template).toBe('em_branco')
  })

  it('maps BoardCardView.topicId to conversation subject chip (W2-3)', () => {
    const flow = projectBoardToFlow(sampleProjectBoard({
      cards: [{
        ticketId: 't-sub',
        title: 'Chip test',
        category: 'todo',
        blocked: false,
        topicId: 'sub-ui',
      }],
    }), {
      conversationSubjects: [{ id: 'sub-ui', name: 'UI', colorIndex: 2, unreadCount: 0 }],
    })
    expect(flow.cards[0]?.conversationSubject).toEqual({ name: 'UI', colorIndex: 2 })
  })
})
