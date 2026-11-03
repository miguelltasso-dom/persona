import { expect, it } from 'vitest'
import {
  DomainError,
  applyWorkflowEdit,
  assertWorkflow,
  parseWorkflowProposal,
  proposeWorkflow,
  workflowFromTemplate,
  wipWarning,
} from '../src/index.ts'

it('templates keep ≥1 todo and ≥1 done; blank may be empty; needs_you is unique', () => {
  for (const id of ['contratacao', 'site', 'software', 'marketing', 'atendimento', 'simples'] as const) {
    const flow = workflowFromTemplate('p', id)
    expect(() => assertWorkflow(flow)).not.toThrow()
    expect(flow.columns.some(column => column.category === 'todo')).toBe(true)
    expect(flow.columns.some(column => column.category === 'done')).toBe(true)
    expect(flow.columns.filter(column => column.category === 'needs_you').length).toBeLessThanOrEqual(1)
  }
  expect(workflowFromTemplate('p', 'em_branco').columns).toEqual([])
  expect(() => assertWorkflow({
    projectId: 'p', template: 'simples', fields: [],
    columns: [
      { id: 'a', name: 'A', category: 'needs_you' },
      { id: 'b', name: 'B', category: 'needs_you' },
      { id: 'c', name: 'C', category: 'todo' },
      { id: 'd', name: 'D', category: 'done' },
    ],
  })).toThrow(DomainError)
})

it('two projects keep their own columns', () => {
  const hire = workflowFromTemplate('p-hire', 'contratacao')
  const site = workflowFromTemplate('p-site', 'site')
  expect(hire.columns[0]?.id).toBe('contratacao-vaga')
  expect(site.columns[0]?.id).toBe('site-descoberta')
  expect(hire.columns.some(column => column.id === site.columns[0]?.id)).toBe(false)
})

it('removing a column without a destination is refused; with destination tickets migrate', () => {
  const flow = workflowFromTemplate('p', 'simples')
  const seats = [
    { projectId: 'p', ticketId: 't1', columnId: 'simples-fazer' },
    { projectId: 'p', ticketId: 't2', columnId: 'simples-fazendo' },
  ]
  const withoutDoing = flow.columns.filter(column => column.id !== 'simples-fazendo')
  expect(() => applyWorkflowEdit(flow, withoutDoing, flow.fields, seats, {})).toThrow(DomainError)
  const migrated = applyWorkflowEdit(flow, withoutDoing, flow.fields, seats, {
    'simples-fazendo': 'simples-fazer',
  })
  expect(migrated.seats.find(row => row.ticketId === 't2')?.columnId).toBe('simples-fazer')
})

it('WIP is a warning, not a lock', () => {
  const flow = workflowFromTemplate('p', 'software')
  const seats = [
    { projectId: 'p', ticketId: 'a', columnId: 'software-andamento' },
    { projectId: 'p', ticketId: 'b', columnId: 'software-andamento' },
    { projectId: 'p', ticketId: 'c', columnId: 'software-andamento' },
  ]
  expect(wipWarning(flow, 'software-andamento', seats, 't-new')).toBe(true)
  expect(wipWarning(flow, 'software-backlog', seats, 't-new')).toBe(false)
})

it('proposal never applies: card asks the person; dirty parser degrades honestly', () => {
  const proposal = proposeWorkflow('p', 'Vamos contratar um designer e marcar entrevistas')
  expect(proposal.template).toBe('contratacao')
  expect(proposal.card.question).toMatch(/Usar este fluxo/)
  expect(proposeWorkflow('p', 'Coisa nenhuma').template).toBe('simples')
  const parsed = parseWorkflowProposal('p', 'claro\n```json\n{"template":"site","reason":"é um site"}\n```')
  expect('degraded' in parsed).toBe(false)
  if (!('degraded' in parsed)) expect(parsed.template).toBe('site')
  const bad = parseWorkflowProposal('p', 'sem json nenhum')
  expect(bad).toMatchObject({ degraded: true })
})
