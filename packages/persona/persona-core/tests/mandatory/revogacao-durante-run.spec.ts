import { expect, it } from 'vitest'
import { can, revokeGrant } from '../../src/index.ts'
import { member } from './helpers.ts'

it('revogação durante run: depois do revoke, can() recusa o que o grant cobria', () => {
  const ticket = { type: 'ticket' as const, workspaceId: 'ws', projectId: 'launch' }
  expect(can(member, 'read', ticket)).toBe(true)
  const revoked = revokeGrant(member, { workspaceRole: 'member', projectIds: ['launch'], channelIds: [], dmIds: [] })
  expect(can(revoked, 'read', ticket)).toBe(false)
})
