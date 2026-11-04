import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

/** PB-5/6/7 Lumen board/editor/sprint wire — host already ships these remotes. */
const PB_REMOTES = [
  'getProjectBoard',
  'listBoards',
  'createWorkflowFromTemplate',
  'updateWorkflow',
  'moveTicket',
  'proposeWorkflow',
  'acceptWorkflowProposal',
  'rejectWorkflowProposal',
  'getProjectConversation',
  'listSprints',
  'createSprint',
  'updateSprint',
  'planSprint',
  'startSprint',
  'closeSprint',
  'sprintSummary',
] as const

it('PB-5/6/7 remotes are on the host (Lumen has nothing missing)', () => {
  const names = new Set(remoteMethods(host()).map(item => item.method))
  for (const name of PB_REMOTES) {
    expect(names.has(name), name).toBe(true)
  }
})
