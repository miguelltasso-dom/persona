/**
 * Forge invite/grant/purge contract, run through {@link InviteBook} so both
 * memory and SQLite persist the same results.
 */

import {
  applyGrant,
  issueInvite,
  peerCanRead,
  purgeSource,
  redeemInvite,
  revokeGrant,
  revokeInvite,
  type Actor,
  type AgedMemory,
  type Grant,
  type VaultRecord,
} from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'
import type { InviteBook } from '../../src/invite/book.ts'

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

/**
 * Same cases as Forge `invite.spec.ts`, persisted on the book.
 * @param label - Backend name.
 * @param open - Fresh book factory.
 */
export function defineInviteBookContract(label: string, open: () => InviteBook): void {
  it(`${label} does not let a friend without a grant read a DM or a vault derivative`, () => {
    const book = open()
    book.putActor(friend)
    const stored = book.getActor('ws', 'amigo')
    expect(stored).toBeDefined()
    expect(peerCanRead(stored ?? friend, dm)).toBe(false)
    expect(peerCanRead(stored ?? friend, vault)).toBe(false)
    const inside = applyGrant(stored ?? friend, grant)
    book.putActor(inside)
    expect(peerCanRead(book.getActor('ws', 'amigo') ?? inside, dm)).toBe(true)
  })

  it(`${label} issues a short-lived single-use token and rejects a second redeem`, () => {
    const book = open()
    const now = 1_000
    const invite = issueInvite(now, { id: 'i1', workspaceId: 'ws', token: 'tok', grant, ttlMs: 60_000 })
    book.putInvite(invite)
    book.putActor(friend)
    const loaded = book.getInvite('i1') ?? invite
    const first = redeemInvite(loaded, now + 10, book.getActor('ws', 'amigo') ?? friend)
    book.putInvite(first.invite)
    book.putActor(first.actor)
    expect(book.getActor('ws', 'amigo')?.projectIds).toContain('launch')
    expect(book.getInviteByToken('ws', 'tok')?.usedAt).toBe(now + 10)
    expect(() => redeemInvite(book.getInvite('i1') ?? first.invite, now + 20, friend)).toThrow('INVITE_INVALID')
    expect(() => redeemInvite(invite, now + 90_000, friend)).toThrow('INVITE_INVALID')
    expect(() => redeemInvite(revokeInvite(invite, now), now + 10, friend)).toThrow('INVITE_INVALID')
  })

  it(`${label} revokes a grant during a run so later can() fails`, () => {
    const book = open()
    const inside = applyGrant(friend, grant)
    book.putActor(inside)
    expect(peerCanRead(book.getActor('ws', 'amigo') ?? inside, dm)).toBe(true)
    const after = revokeGrant(book.getActor('ws', 'amigo') ?? inside, grant)
    book.putActor(after)
    const stored = book.getActor('ws', 'amigo') ?? after
    expect(peerCanRead(stored, dm)).toBe(false)
    expect(stored.projectIds).not.toContain('launch')
  })

  it(`${label} revokes a source and archives derived vault and memory rows`, () => {
    const book = open()
    const record: VaultRecord = {
      id: 'v1', workspaceId: 'ws', kind: 'memory', body: 'nota', status: 'active',
      sourceIds: ['src-gh'], authorId: 'miguel', visibility: { kind: 'workspace' },
      createdAt: '2026-11-03T15:00:00Z', revision: 1,
    }
    const memory: AgedMemory = {
      id: 'm1', layer: 'episodic', body: 'derivado de src-gh', score: 0.8, uses: 1, archived: false,
    }
    book.putVaultRecords([record])
    book.putMemories([memory])
    const purged = purgeSource('src-gh', book.listVaultRecords(), book.listMemories())
    book.putVaultRecords(purged.records)
    book.putMemories(purged.memories)
    expect(book.listVaultRecords()[0]?.status).toBe('revoked')
    expect(book.listMemories()[0]?.archived).toBe(true)
  })
}
