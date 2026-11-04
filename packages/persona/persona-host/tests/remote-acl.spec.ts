import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import PersonaHost, { ACL_EXCEPTIONS } from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('every remote goes through can() except the documented list', () => {
  const h = host()
  const remotes = remoteMethods(h).map(item => item.method)
  expect(remotes.length).toBeGreaterThan(10)
  for (const name of remotes) {
    if (ACL_EXCEPTIONS[name] !== undefined) continue
    const desc = Object.getOwnPropertyDescriptor(PersonaHost.prototype, name)
    const value: unknown = desc?.value
    const src = typeof value === 'function' ? Function.prototype.toString.call(value) : ''
    expect(
      src.includes('requireProject') || src.includes('requireWorkspace') || src.includes('requireFileRoot')
      || src.includes('requireWrite') || src.includes('requireGovOwner') || src.includes('requireGovAvailability')
      || src.includes('actorOf') || src.includes('sessionCan'),
      `${name} skipped can()`,
    ).toBe(true)
  }
  expect(ACL_EXCEPTIONS.ping).toMatch(/liveness/)
  expect(ACL_EXCEPTIONS.getOnboarding).toMatch(/workspace/)
  expect(ACL_EXCEPTIONS.completeOnboarding).toMatch(/owner/)
})

it('guest without DM/project access gets empty, not a revealing error', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'guest', workspaceId: 'ws', projectId: 'pp', displayName: 'G', handle: 'g', role: 'guest' })
  h.createDm({ id: 'secret', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
  h.sessionMemberId = 'guest'
  expect(h.listProjects({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  expect(h.listDms({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  expect(h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'secret',
    actorId: 'guest', afterSeq: 0, limit: 10,
  })).toEqual({ events: [], nextSeq: 0 })
})
