/**
 * Product records persisted in schema v1. Tenant boundary is `projectId` (D-038).
 */

import type { Persona } from '@deepseek-ai/dsh-persona-core'

/** Company / account container. */
export interface Workspace {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Human member of a workspace. */
export interface Member {
  readonly id: string
  readonly workspaceId: string
  readonly displayName: string
  readonly handle: string
  readonly role: 'owner' | 'member' | 'guest'
  readonly createdAt: string
}

/** Project tenant. Exactly one `personal` ("Pessoal") per workspace. */
export interface Project {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly description: string
  readonly kind: 'personal' | 'shared'
  readonly createdAt: string
  readonly updatedAt: string
  readonly rootPath?: string
}

/** Persisted persona plus the project tenant (Forge schema has no projectId). */
export interface StoredPersona extends Persona {
  readonly projectId: string
}

/** Persona membership in a project or channel. */
export interface Participation {
  readonly personaId: string
  readonly projectId: string
  readonly kind: 'project' | 'channel'
  readonly targetId: string
  readonly createdAt: string
}

/** Named channel inside a project. */
export interface Channel {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly topic: string
  readonly createdAt: string
}

/** Canonical DM pair (`participantA < participantB`) inside a project. */
export interface DirectMessage {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly participantA: string
  readonly participantB: string
  readonly createdAt: string
}

/** Inputs for {@link import('./repos.ts').ProductRepos.createWorkspace}. */
export interface CreateWorkspaceInput {
  readonly id: string
  readonly name: string
  readonly personalProjectId: string
}

/** Inputs for {@link import('./repos.ts').ProductRepos.createProject}. */
export interface CreateProjectInput {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly description?: string
  readonly rootPath?: string
}

/** Inputs for {@link import('./repos.ts').ProductRepos.createMember}. */
export interface CreateMemberInput {
  readonly id: string
  readonly workspaceId: string
  readonly displayName: string
  readonly handle: string
  readonly role: Member['role']
}

/** Inputs for {@link import('./repos.ts').ProductRepos.createChannel}. */
export interface CreateChannelInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly topic?: string
}

/** Inputs for {@link import('./repos.ts').ProductRepos.createDm}. */
export interface CreateDmInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly participantA: string
  readonly participantB: string
}
