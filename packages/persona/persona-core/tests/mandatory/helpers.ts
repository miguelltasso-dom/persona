import type { Actor, ContextRecord, ContextScope, SkillRecord } from '../../src/index.ts'

export const scope: ContextScope = {
  workspaceId: 'ws',
  projectId: 'launch',
  agentId: 'bento',
  actorId: 'miguel',
  audienceId: 'channel-launch',
  policyRevision: '1',
}

export const owner: Actor = {
  kind: 'user', id: 'miguel', workspaceId: 'ws', workspaceRole: 'owner', projectIds: ['launch'],
}

export const member: Actor = {
  kind: 'user', id: 'ana', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['launch'],
}

export const friend: Actor = {
  kind: 'user', id: 'amigo', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['ops'],
}

export function record(id: string, overrides: Partial<ContextRecord> = {}): ContextRecord {
  return {
    id,
    workspaceId: 'ws',
    projectId: 'launch',
    revision: 1,
    kind: 'memory',
    status: 'active',
    body: id,
    sourceIds: [],
    ...overrides,
  }
}

export function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 's1',
    name: 'review',
    version: 1,
    scope: 'persona',
    origin: 'library',
    body: 'Revise o diff.',
    enabled: true,
    personaId: 'bento',
    ...overrides,
  }
}
