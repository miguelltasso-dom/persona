import { expect, it } from 'vitest'
import { assertCan, authorizeContext, authorizeRecall, can } from '../src/index.ts'
import type { AclAction, AclResource, Actor } from '../src/index.ts'

const owner: Actor = {
  kind: 'user', id: 'miguel', workspaceId: 'ws', workspaceRole: 'owner', projectIds: ['launch', 'ops'],
}
const member: Actor = {
  kind: 'user', id: 'ana', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['launch'],
}
const guest: Actor = {
  kind: 'user', id: 'visitor', workspaceId: 'ws', workspaceRole: 'guest', projectIds: [],
}
const foreign: Actor = {
  kind: 'user', id: 'other', workspaceId: 'other', workspaceRole: 'owner', projectIds: ['launch'],
}
const coordinator: Actor = {
  kind: 'persona',
  id: 'coord',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
  systemRoles: ['coordination'],
  canRecruit: true,
}
const watchdog: Actor = {
  kind: 'persona',
  id: 'watch',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
  systemRoles: ['watchdog'],
}
const worker: Actor = {
  kind: 'persona',
  id: 'bento',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
}

const cases: ReadonlyArray<[string, Actor, AclAction, AclResource, boolean]> = [
  ['owner reads workspace', owner, 'read', { type: 'workspace', workspaceId: 'ws' }, true],
  ['guest reads workspace', guest, 'read', { type: 'workspace', workspaceId: 'ws' }, true],
  ['foreign owner cannot read workspace', foreign, 'read', { type: 'workspace', workspaceId: 'ws' }, false],
  ['member cannot manage workspace', member, 'manage', { type: 'workspace', workspaceId: 'ws' }, false],
  ['owner manages workspace', owner, 'manage', { type: 'workspace', workspaceId: 'ws' }, true],
  ['owner assigns roles', owner, 'assign_role', { type: 'workspace', workspaceId: 'ws' }, true],
  ['coordinator cannot assign roles', coordinator, 'assign_role', { type: 'workspace', workspaceId: 'ws' }, false],
  ['guest cannot write workspace', guest, 'write', { type: 'workspace', workspaceId: 'ws' }, false],
  ['member reads own project', member, 'read', { type: 'project', workspaceId: 'ws', projectId: 'launch' }, true],
  ['member cannot read other project', member, 'read', { type: 'project', workspaceId: 'ws', projectId: 'ops' }, false],
  ['owner reads any project', owner, 'read', { type: 'project', workspaceId: 'ws', projectId: 'ops' }, true],
  ['guest cannot read project', guest, 'read', { type: 'project', workspaceId: 'ws', projectId: 'launch' }, false],
  ['member writes own project', member, 'write', { type: 'project', workspaceId: 'ws', projectId: 'launch' }, true],
  ['guest cannot write project', guest, 'write', { type: 'project', workspaceId: 'ws', projectId: 'launch' }, false],
  ['member reads persona', member, 'read', { type: 'persona', workspaceId: 'ws', personaId: 'bento' }, true],
  ['guest cannot read other persona', guest, 'read', { type: 'persona', workspaceId: 'ws', personaId: 'bento' }, false],
  ['worker edits self', worker, 'write', { type: 'persona', workspaceId: 'ws', personaId: 'bento' }, true],
  ['worker cannot edit peer', worker, 'write', { type: 'persona', workspaceId: 'ws', personaId: 'coord' }, false],
  ['owner deletes persona', owner, 'delete', { type: 'persona', workspaceId: 'ws', personaId: 'bento' }, true],
  ['coordinator recruits', coordinator, 'recruit', { type: 'workspace', workspaceId: 'ws' }, true],
  ['worker without recruit flag cannot recruit', worker, 'recruit', { type: 'workspace', workspaceId: 'ws' }, false],
  ['guest cannot recruit', guest, 'recruit', { type: 'workspace', workspaceId: 'ws' }, false],
  ['member reads channel in project', member, 'read', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, true],
  ['member cannot reply on channel', member, 'reply', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, false],
  ['coordinator replies on channel', coordinator, 'reply', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, true],
  ['watchdog cannot reply on channel', watchdog, 'reply', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, false],
  ['coordinator decides on channel', coordinator, 'decide', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, true],
  ['watchdog cannot decide', watchdog, 'decide', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, false],
  ['dm member reads dm', member, 'read', { type: 'dm', workspaceId: 'ws', dmId: 'dm1', memberIds: ['ana', 'miguel'] }, true],
  ['outsider cannot read dm', worker, 'read', { type: 'dm', workspaceId: 'ws', dmId: 'dm1', memberIds: ['ana', 'miguel'] }, false],
  ['dm member writes dm', member, 'write', { type: 'dm', workspaceId: 'ws', dmId: 'dm1', memberIds: ['ana', 'miguel'] }, true],
  ['assignee reads ticket', worker, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'launch', assigneeId: 'bento' }, true],
  ['watchdog reads ticket', watchdog, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'ops' }, true],
  ['member outside project cannot read ticket', member, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'ops' }, false],
  ['assignee writes own ticket', worker, 'write', { type: 'ticket', workspaceId: 'ws', projectId: 'launch', assigneeId: 'bento' }, true],
  ['peer cannot write others ticket', worker, 'write', { type: 'ticket', workspaceId: 'ws', projectId: 'launch', assigneeId: 'nina' }, false],
  ['coordinator writes any ticket', coordinator, 'write', { type: 'ticket', workspaceId: 'ws', projectId: 'launch', assigneeId: 'nina' }, true],
  ['member reads workspace vault', member, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'brief',
  }, true],
  ['guest reads workspace vault', guest, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'brief',
  }, true],
  ['member cannot read other project vault', member, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'project', projectId: 'ops' }, status: 'active', kind: 'memory',
  }, false],
  ['member reads own project vault', member, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'project', projectId: 'launch' }, status: 'active', kind: 'memory',
  }, true],
  ['persona reads own vault', worker, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'persona', personaId: 'bento' }, status: 'active', kind: 'memory',
  }, true],
  ['peer cannot read persona vault', coordinator, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'persona', personaId: 'bento' }, status: 'active', kind: 'memory',
  }, false],
  ['listed member reads members vault', member, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'members', memberIds: ['ana'] }, status: 'active', kind: 'memory',
  }, true],
  ['unlisted cannot read members vault', worker, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'members', memberIds: ['ana'] }, status: 'active', kind: 'memory',
  }, false],
  ['guest cannot read revoked vault', guest, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'revoked', kind: 'decision',
  }, false],
  ['owner reads revoked vault', owner, 'read', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'revoked', kind: 'decision',
  }, true],
  ['member cannot write decision', member, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'decision',
  }, false],
  ['coordinator writes decision', coordinator, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'decision',
  }, true],
  ['member writes memory', member, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'memory',
  }, true],
  ['guest cannot write memory', guest, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'memory',
  }, false],
  ['nobody writes revoked vault', owner, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'revoked', kind: 'brief',
  }, false],
  ['owner approves proposal', owner, 'approve', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, true],
  ['coordinator approves proposal', coordinator, 'approve', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, true],
  ['worker cannot approve proposal', worker, 'approve', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, false],
  ['recruiter creates proposal', coordinator, 'create', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, true],
  ['member reads channel message', member, 'read', {
    type: 'message', workspaceId: 'ws', stream: 'channel', streamId: 'geral', projectId: 'launch',
  }, true],
  ['member cannot write channel message', member, 'write', {
    type: 'message', workspaceId: 'ws', stream: 'channel', streamId: 'geral', projectId: 'launch',
  }, false],
  ['coordinator writes channel message', coordinator, 'write', {
    type: 'message', workspaceId: 'ws', stream: 'channel', streamId: 'geral', projectId: 'launch',
  }, true],
  ['dm member recalls dm message', member, 'recall', {
    type: 'message', workspaceId: 'ws', stream: 'dm', streamId: 'dm1', memberIds: ['ana'],
  }, true],
  ['outsider cannot recall dm', worker, 'recall', {
    type: 'message', workspaceId: 'ws', stream: 'dm', streamId: 'dm1', memberIds: ['ana'],
  }, false],
  ['member reads routine in project', member, 'read', { type: 'routine', workspaceId: 'ws', projectId: 'launch' }, true],
  ['member cannot write routine', member, 'write', { type: 'routine', workspaceId: 'ws', projectId: 'launch' }, false],
  ['coordinator writes routine', coordinator, 'write', { type: 'routine', workspaceId: 'ws', projectId: 'launch' }, true],
  ['watchdog cannot write routine', watchdog, 'write', { type: 'routine', workspaceId: 'ws', projectId: 'launch' }, false],
  ['guest reads own persona', { ...guest, id: 'visitor' }, 'read', { type: 'persona', workspaceId: 'ws', personaId: 'visitor' }, true],
  ['owner creates persona', owner, 'create', { type: 'persona', workspaceId: 'ws', personaId: 'new' }, true],
  ['coordinator decides ticket', coordinator, 'decide', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' }, true],
  ['owner deletes ticket', owner, 'delete', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' }, true],
  ['member cannot delete ticket', member, 'delete', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' }, false],
  ['guest reads own proposal', guest, 'read', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'visitor' }, true],
  ['guest cannot read peer proposal', guest, 'read', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, false],
  ['creator deletes proposal', coordinator, 'delete', { type: 'proposal', workspaceId: 'ws', creatorPersonaId: 'coord' }, true],
  ['channel message without project is refused', member, 'read', {
    type: 'message', workspaceId: 'ws', stream: 'channel', streamId: 'geral',
  }, false],
  ['owner deletes vault', owner, 'delete', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'brief',
  }, true],
  ['owner creates workspace row', owner, 'create', { type: 'workspace', workspaceId: 'ws' }, true],
  ['member follows channel', member, 'follow', { type: 'channel', workspaceId: 'ws', projectId: 'launch' }, true],
  ['member follows ticket', member, 'follow', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' }, true],
  ['coordinator writes constraint', coordinator, 'write', {
    type: 'vault', workspaceId: 'ws', visibility: { kind: 'workspace' }, status: 'active', kind: 'constraint',
  }, true],
  ['dm via dmIds', { ...worker, dmIds: ['dm1'] }, 'read', {
    type: 'dm', workspaceId: 'ws', dmId: 'dm1', memberIds: ['ana'],
  }, true],
  ['owner deletes routine', owner, 'delete', { type: 'routine', workspaceId: 'ws', projectId: 'launch' }, true],
]

it.each(cases)('%s', (_name, actor, action, resource, allowed) => {
  expect(can(actor, action, resource)).toBe(allowed)
})

it('assertCan throws ACL_DENIED when refused', () => {
  expect(() => { assertCan(guest, 'write', { type: 'workspace', workspaceId: 'ws' }) }).toThrow('ACL_DENIED')
  assertCan(owner, 'manage', { type: 'workspace', workspaceId: 'ws' })
})

it('authorizeContext admits only readable vault-backed records', async () => {
  const allow = authorizeContext(member)
  const deny = authorizeContext(guest)
  const projectMemory = {
    id: 'm1',
    workspaceId: 'ws',
    projectId: 'launch',
    revision: 1,
    kind: 'memory' as const,
    status: 'active',
    body: 'ok',
    sourceIds: [],
  }
  const personaMemory = { ...projectMemory, id: 'm2', agentId: 'bento' }
  const scope = {
    workspaceId: 'ws',
    projectId: 'launch',
    agentId: 'bento',
    actorId: 'ana',
    audienceId: 'geral',
    policyRevision: '1',
  }
  expect(await allow(projectMemory, scope)).toBe(true)
  expect(await allow(personaMemory, scope)).toBe(false)
  expect(await deny(projectMemory, scope)).toBe(false)
  expect(await allow({ ...projectMemory, kind: 'task' }, scope)).toBe(true)
  expect(await allow({ ...projectMemory, status: 'revoked' }, scope)).toBe(false)
})

it('authorizeRecall admits channel events only in the actor projects', async () => {
  const gate = authorizeRecall(member)
  const scope = {
    workspaceId: 'ws',
    projectId: 'launch',
    agentId: 'bento',
    actorId: 'ana',
    audienceId: 'geral',
    policyRevision: '1',
  }
  const event = {
    id: 'e1',
    workspaceId: 'ws',
    projectId: 'launch',
    sequence: 1,
    subjectId: 'geral',
    occurredAt: '2026-11-03T13:00:00Z',
    type: 'message',
    body: 'oi',
  }
  expect(await gate(event, scope)).toBe(true)
  expect(await gate({ ...event, projectId: 'ops' }, scope)).toBe(false)
})
