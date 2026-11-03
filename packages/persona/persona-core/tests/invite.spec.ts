import { expect, it } from 'vitest'
import {
  applyGrant,
  issueInvite,
  peerCanRead,
  purgeSource,
  redeemInvite,
  revokeGrant,
  revokeInvite,
} from '../src/index.ts'
import type { Actor, AgedMemory, Grant, VaultRecord } from '../src/index.ts'

const friend: Actor = {
  kind: 'user', id: 'amigo', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
}

const grant: Grant = {
  workspaceRole: 'member',
  projectIds: ['launch'],
  channelIds: ['geral'],
  dmIds: ['dm-ana'],
}

const dm = { type: 'dm' as const, workspaceId: 'ws', dmId: 'dm-ana', memberIds: ['ana'] }
const vault: Extract<Parameters<typeof peerCanRead>[1], { type: 'vault' }> = {
  type: 'vault',
  workspaceId: 'ws',
  visibility: { kind: 'members', memberIds: ['ana'] },
  status: 'active',
  kind: 'memory',
}

it('does not let a friend without a grant read a DM or a vault derivative', () => {
  expect(peerCanRead(friend, dm)).toBe(false)
  expect(peerCanRead(friend, vault)).toBe(false)
  const inside = applyGrant(friend, grant)
  expect(peerCanRead(inside, dm)).toBe(true)
})

it('issues a short-lived single-use token and rejects a second redeem', () => {
  const now = 1_000
  const invite = issueInvite(now, { id: 'i1', workspaceId: 'ws', token: 'tok', grant, ttlMs: 60_000 })
  const first = redeemInvite(invite, now + 10, friend)
  expect(first.actor.projectIds).toContain('launch')
  expect(() => redeemInvite(first.invite, now + 20, friend)).toThrow('INVITE_INVALID')
  expect(() => redeemInvite(invite, now + 90_000, friend)).toThrow('INVITE_INVALID')
  expect(() => redeemInvite(revokeInvite(invite, now), now + 10, friend)).toThrow('INVITE_INVALID')
})

it('revokes a grant during a run so later can() fails', () => {
  const inside = applyGrant(friend, grant)
  expect(peerCanRead(inside, dm)).toBe(true)
  const after = revokeGrant(inside, grant)
  expect(peerCanRead(after, dm)).toBe(false)
  expect(after.projectIds).not.toContain('launch')
})

it('revokes a source and archives derived vault and memory rows', () => {
  const record: VaultRecord = {
    id: 'v1', workspaceId: 'ws', kind: 'memory', body: 'nota', status: 'active',
    sourceIds: ['src-gh'], authorId: 'miguel', visibility: { kind: 'workspace' },
    createdAt: '2026-11-03T15:00:00Z', revision: 1,
  }
  const memory: AgedMemory = {
    id: 'm1', layer: 'episodic', body: 'derivado de src-gh', score: 0.8, uses: 1, archived: false,
  }
  const purged = purgeSource('src-gh', [record], [memory])
  expect(purged.records[0]?.status).toBe('revoked')
  expect(purged.memories[0]?.archived).toBe(true)
})
