import { expect, it } from 'vitest'
import { admitTrigger } from '../src/index.ts'
import type { Actor } from '../src/index.ts'

const coordinator: Actor = {
  kind: 'persona',
  id: 'coord',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
  systemRoles: ['coordination'],
}

const worker: Actor = {
  kind: 'persona',
  id: 'bento',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
}

it('admits an addressed human as explicit only when the actor may decide', () => {
  expect(admitTrigger(coordinator, { projectId: 'launch', human: true, addressed: 'mention' }))
    .toEqual({ admissible: true, strength: 'explicit' })
  expect(admitTrigger(coordinator, { projectId: 'launch', human: true }))
    .toEqual({ admissible: true, strength: 'inferred' })
  expect(admitTrigger(coordinator, { projectId: 'launch', human: false }))
    .toEqual({ admissible: false, reason: 'notHuman' })
  expect(admitTrigger(worker, { projectId: 'launch', human: true, addressed: 'direct' }))
    .toEqual({ admissible: false, reason: 'aclDenied' })
})
