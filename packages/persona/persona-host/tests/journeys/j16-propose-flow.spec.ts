import { decideWorkflowProposal, MemoryWorkflowStore } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { openJourney, seedJourney, it } from './journey-host.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const

it('J16 — Coordenação propõe fluxo: cartão, aprovar aplica, recusar não muda, JSON sujo degrada', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.createWorkflowFromTemplate({ ...SCOPE, template: 'simples' })
  const before = h.getProjectBoard(SCOPE).workflow.template
  expect(before).toBe('simples')

  const proposal = h.proposeWorkflow({
    ...SCOPE, description: 'vamos contratar um candidato e marcar entrevistas',
  })
  expect(proposal.card.question).toMatch(/Usar este fluxo/)
  expect(proposal.template).toBe('contratacao')
  expect(h.getProjectBoard(SCOPE).workflow.template).toBe('simples')

  const store = new MemoryWorkflowStore()
  expect(decideWorkflowProposal(store, {
    projectId: 'pp',
    template: proposal.template as 'contratacao',
    reason: proposal.reason,
    workflow: {
      projectId: 'pp',
      template: 'contratacao',
      columns: h.proposeWorkflow({ ...SCOPE, description: 'contratar vaga' }).workflow.columns.map(column => ({ ...column })),
      fields: h.proposeWorkflow({ ...SCOPE, description: 'contratar vaga' }).workflow.fields.map(field => ({ ...field })),
    },
    card: proposal.card,
  }, false)).toBeUndefined()
  expect(h.getProjectBoard(SCOPE).workflow.template).toBe('simples')

  h.acceptWorkflowProposal({
    ...SCOPE,
    columns: proposal.workflow.columns,
    fields: proposal.workflow.fields,
  })
  expect(h.getProjectBoard(SCOPE).workflow.template).toBe('contratacao')
  const other = h.proposeWorkflow({ ...SCOPE, description: 'landing page do site' })
  expect(h.rejectWorkflowProposal(SCOPE).template).toBe('contratacao')
  expect(other.template).toBe('site')

  const dirty = h.proposeWorkflow({
    ...SCOPE, description: 'claro\n```json\n{"template":"site","reason":"é um site"}\n```',
  })
  expect(dirty.degraded).toBeUndefined()
  expect(dirty.template).toBe('site')

  const bad = h.proposeWorkflow({ ...SCOPE, description: '```json\n{nao-json\n```' })
  expect(bad.degraded).toBe(true)
  expect(bad.reason).toMatch(/JSON|ilegível|fluxo/i)
  expect(h.getProjectBoard(SCOPE).workflow.template).toBe('contratacao')
})
