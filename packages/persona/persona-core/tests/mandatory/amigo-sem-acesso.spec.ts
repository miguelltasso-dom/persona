import { expect, it } from 'vitest'
import { can, peerCanRead } from '../../src/index.ts'
import { friend, member } from './helpers.ts'

it('amigo sem acesso: amizade/membership de outro projeto não lê DM nem ticket', () => {
  const dm = { type: 'dm' as const, workspaceId: 'ws', dmId: 'dm-1', memberIds: [member.id] }
  expect(peerCanRead(friend, dm)).toBe(false)
  expect(peerCanRead(member, dm)).toBe(true)
  expect(can(friend, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' })).toBe(false)
  expect(can(friend, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'ops' })).toBe(true)
})
