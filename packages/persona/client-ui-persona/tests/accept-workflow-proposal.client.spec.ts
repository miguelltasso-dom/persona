import { describe, expect, it } from 'vitest'
import { destByRemovedForProposal } from '../src/client/kanban/accept-workflow-proposal.ts'
import { buildAcceptWorkflowRequest } from '../src/client/data/boards-remote.ts'
import type { WorkflowColumnView, WorkflowProposalView } from '@deepseek-ai/dsh-persona-host/types'

const CURRENT: readonly Pick<WorkflowColumnView, 'id'>[] = [
  { id: 'old-a' },
  { id: 'old-b' },
]

const NEXT: WorkflowColumnView[] = [
  { id: 'new-todo', name: 'Backlog', category: 'todo' },
  { id: 'new-done', name: 'Done', category: 'done' },
]

describe('destByRemovedForProposal', () => {
  it('maps removed columns with tickets to the first todo column', () => {
    const dest = destByRemovedForProposal(CURRENT, NEXT, { 'old-a': 2, 'old-b': 0 })
    expect(dest).toEqual({ 'old-a': 'new-todo' })
  })

  it('buildAcceptWorkflowRequest carries template from the card', () => {
    const proposal: WorkflowProposalView = {
      template: 'site',
      workflow: { projectId: 'p1', template: 'site', columns: NEXT, fields: [] },
      card: { question: 'Q', primary: 'Ok', impact: 'I' },
      reason: 'R',
    }
    const req = buildAcceptWorkflowRequest(
      { workspaceId: 'ws', projectId: 'p1' },
      proposal,
      { 'old-a': 'new-todo' },
    )
    expect(req.template).toBe('site')
    expect(req.destByRemoved).toEqual({ 'old-a': 'new-todo' })
  })
})
