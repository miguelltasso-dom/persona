import { applyGrant, issueInvite, type Grant } from '@deepseek-ai/dsh-persona-core'
import { afterEach, expect, it } from 'vitest'
import {
  MemoryInviteBook,
  openPersonaStore,
  openTempStore,
  SqliteInviteBook,
  type PersonaStore,
  type TempStore,
} from '../src/index.ts'
import { defineInviteBookContract } from './contract/invite.contract.ts'

const memories: PersonaStore[] = []
const temps: TempStore[] = []

afterEach(async () => {
  for (const store of memories.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function sqliteBook(): SqliteInviteBook {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  return new SqliteInviteBook(store)
}

defineInviteBookContract('memory', () => new MemoryInviteBook())
defineInviteBookContract('sqlite', () => sqliteBook())

it('sqlite reopen preserves invite, grant, and purged rows', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const book = new SqliteInviteBook(handle.store)
  const grant: Grant = {
    workspaceRole: 'member',
    projectIds: ['launch'],
    channelIds: ['geral'],
    dmIds: ['dm-ana'],
  }
  const invite = issueInvite(1_000, { id: 'i1', workspaceId: 'ws', token: 'tok', grant, ttlMs: 60_000 })
  book.putInvite(invite)
  book.putActor(applyGrant({
    kind: 'user', id: 'amigo', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
  }, grant))
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  memories.push(again)
  const reopened = new SqliteInviteBook(again)
  expect(reopened.getInvite('i1')?.token).toBe('tok')
  expect(reopened.getInviteByToken('ws', 'tok')?.id).toBe('i1')
  expect(reopened.getActor('ws', 'amigo')?.projectIds).toContain('launch')
})
