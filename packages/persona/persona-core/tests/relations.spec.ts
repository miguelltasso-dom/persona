import { expect, it } from 'vitest'
import { canWithLayout, positionAffectsPolicy, relationGrantsAccess, relationStartsWork } from '../src/index.ts'
import type { Actor, Delegation, Relation } from '../src/index.ts'

const friend: Actor = {
  kind: 'user', id: 'amigo', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
}
const relation: Relation = { id: 'r1', fromId: 'amigo', toId: 'ana', kind: 'nearby' }
const dm = { type: 'dm' as const, workspaceId: 'ws', dmId: 'dm-ana', memberIds: ['ana'] }

it('does not grant access or start work from a canvas relation', () => {
  expect(relationGrantsAccess(relation)).toBe(false)
  expect(relationStartsWork(relation)).toBe(false)
  const delegation: Delegation = {
    id: 'd1', fromPersonaId: 'coord', toPersonaId: 'bento', ticketId: 't1', at: '2026-11-03T15:00:00Z',
  }
  expect(relationStartsWork(relation, delegation)).toBe(true)
  expect(canWithLayout(friend, 'read', dm, { objectId: 'amigo', x: 10, y: 4 }, relation)).toBe(false)
})

it('ignores position when deciding policy', () => {
  expect(positionAffectsPolicy({ objectId: 't1', x: 0, y: 0 })).toBe(false)
})
