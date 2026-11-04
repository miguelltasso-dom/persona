import { describe, expect, it, vi } from 'vitest'
import {
  acceptWorkflowProposalRemote,
  proposeWorkflowRemote,
  rejectWorkflowProposalRemote,
} from '../src/client/data/boards-remote.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'proj' }

const PROPOSAL = {
  template: 'site',
  workflow: {
    projectId: 'proj',
    template: 'site',
    columns: [{ id: 'c1', name: 'Todo', category: 'todo' as const }],
    fields: [],
  },
}

describe('boards-remote (PB-6 wire)', () => {
  it('proposeWorkflowRemote unwraps host proposal', async () => {
    const persona = {
      proposeWorkflow: vi.fn(async () => ({ ok: true as const, value: PROPOSAL })),
    } as unknown as PersonaRemoteClient
    const view = await proposeWorkflowRemote(persona, { ...SCOPE, description: 'Site' })
    expect(view.template).toBe('site')
  })

  it('acceptWorkflowProposalRemote falls back to updateWorkflow on older hosts', async () => {
    const updateWorkflow = vi.fn(async () => ({ ok: true as const, value: PROPOSAL.workflow }))
    const persona = { updateWorkflow } as unknown as PersonaRemoteClient
    await acceptWorkflowProposalRemote(persona, {
      ...SCOPE,
      columns: PROPOSAL.workflow.columns,
      fields: [],
      template: 'site',
    })
    expect(updateWorkflow).toHaveBeenCalledTimes(1)
  })

  it('rejectWorkflowProposalRemote is no-op when host omits reject', async () => {
    const persona = {} as PersonaRemoteClient
    await expect(rejectWorkflowProposalRemote(persona, SCOPE)).resolves.toBeUndefined()
  })
})
