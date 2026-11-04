import { workflowRefusalText } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { openJourney, sayOn, seedJourney, seedProject, it } from './journey-host.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'code' } as const

it('J14 — editar fluxo com Tarefas vivas; sem destino recusa em pt-BR; Vigia/puxada seguem', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  seedProject(h, {
    id: 'code', name: 'Software', template: 'software',
    team: [{ id: 'dev', name: 'Bento', title: 'Engenharia', coordination: true }],
  })
  sayOn(h, 'code', 'm-code', 'preciso de um README no projeto')
  await h.orchestration.flush('code')
  const task = h.listTasks(SCOPE)[0]
  expect(task).toBeDefined()
  h.moveTicket({ ...SCOPE, ticketId: task!.id, columnId: 'software-andamento' })
  expect(h.getProjectBoard(SCOPE).cards.some(card => card.ticketId === task!.id)).toBe(true)

  const current = h.getProjectBoard(SCOPE).workflow
  const extra = {
    id: 'software-qa', name: 'QA', category: 'review' as const,
  }
  const renamed = current.columns.map(column => (
    column.id === 'software-andamento' ? { ...column, name: 'Em curso' } : column
  ))
  const reordered = [renamed[1]!, renamed[0]!, ...renamed.slice(2), extra]
  h.updateWorkflow({
    ...SCOPE,
    columns: reordered,
    fields: current.fields,
  })
  const afterAdd = h.getProjectBoard(SCOPE)
  expect(afterAdd.workflow.columns[0]?.id).toBe('software-sprint')
  expect(afterAdd.workflow.columns.find(column => column.id === 'software-andamento')?.name).toBe('Em curso')
  expect(afterAdd.workflow.columns.some(column => column.id === 'software-qa')).toBe(true)
  expect(afterAdd.cards.some(card => card.ticketId === task!.id)).toBe(true)

  const withoutSprint = afterAdd.workflow.columns.filter(column => column.id !== 'software-sprint')
  try {
    h.updateWorkflow({
      ...SCOPE,
      columns: withoutSprint,
      fields: afterAdd.workflow.fields,
    })
    expect.fail('removeu coluna sem destino')
  } catch (error) {
    const text = workflowRefusalText(error)
    expect(text).toMatch(/destino/)
    expect(text).not.toMatch(/INVALID_WORKFLOW/)
  }

  h.updateWorkflow({
    ...SCOPE,
    columns: withoutSprint,
    fields: afterAdd.workflow.fields,
    destByRemoved: { 'software-sprint': 'software-backlog' },
  })
  const afterRemove = h.getProjectBoard(SCOPE)
  expect(afterRemove.workflow.columns.some(column => column.id === 'software-sprint')).toBe(false)
  const kept = afterRemove.cards.find(card => card.ticketId === task!.id)
  expect(kept).toBeDefined()
  expect(kept!.category === 'doing' || kept!.columnId === 'software-andamento').toBe(true)

  expect(() => { h.proactivity.tickWatchdog('code', 60_000) }).not.toThrow()
  expect(() => { h.orchestration.tick('code') }).not.toThrow()
  expect(h.getProjectBoard(SCOPE).cards.some(card => card.ticketId === task!.id)).toBe(true)
})
